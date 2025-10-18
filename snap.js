import * as C from './constants.js';
import * as U from './utils.js';

function findAllVertexMerges(sourceVertices, targetVertices, snapRadius) {
    const mergeCandidates = [];
    for (const source of sourceVertices) {
        for (const target of targetVertices) {
            if (source.originalId === target.originalId && source.transformIndex === target.transformIndex) {
                continue;
            }
            const dist = U.distance(source, target);
            if (dist < snapRadius) {
                mergeCandidates.push({
                    dist: dist,
                    sourceVertex: source,
                    targetVertex: target,
                    correctionVector: { x: target.x - source.x, y: target.y - source.y },
                    type: 'vertex-vertex'
                });
            }
        }
    }
    return mergeCandidates;
}

function findVertexToEdgeSnaps(sourceVertices, targetEdges, snapRadius) {
    const candidates = [];
    for (const sourceVertex of sourceVertices) {
        for (const targetEdge of targetEdges) {
            if (!targetEdge || !targetEdge.originalEdge || !targetEdge.p1 || !targetEdge.p2) {
                continue;
            }
            
            const isSameInstance = sourceVertex.transformIndex === targetEdge.transformIndex;
            const isOwnEndpoint = sourceVertex.originalId === targetEdge.originalEdge.id1 || sourceVertex.originalId === targetEdge.originalEdge.id2;
            if (isSameInstance && isOwnEndpoint) {
                continue;
            }

            const closest = U.getClosestPointOnLineSegment(sourceVertex, targetEdge.p1, targetEdge.p2);
            if (closest.distance < snapRadius && closest.onSegmentStrict) {
                candidates.push({
                    dist: closest.distance,
                    sourceVertex: sourceVertex,
                    targetEdge: targetEdge,
                    snapPoint: { x: closest.x, y: closest.y },
                    correctionVector: { x: closest.x - sourceVertex.x, y: closest.y - sourceVertex.y },
                    type: 'vertex-to-edge'
                });
            }
        }
    }
    return candidates;
}

export function getGeneralSnapResult(
    initialDragVertexStates,
    allVertices,
    allEdges,
    findVertexById,
    copyCount,
    viewTransform,
    rawTransform,
    applyTransform
) {
    const snapRadius = C.MERGE_RADIUS_SCREEN / viewTransform.scale;
    const verticesToDrag = initialDragVertexStates.filter(p => p.type === 'regular');
    if (verticesToDrag.length === 0) {
        return { snapped: false, finalTransform: rawTransform, mergePairs: [], edgeSnaps: [] };
    }

    const initialDraggedIds = new Set(initialDragVertexStates.map(p => p.id));

    // --- THIS BLOCK IS THE PRIMARY FIX ---
    // It now correctly generates moving instances for both single (copyCount=1)
    // and multi-copy (copyCount > 1) drags.
    const rawMovingVertices = [];
    const numMovingInstances = copyCount > 1 ? copyCount - 1 : 1;
    for (let i = 0; i < numMovingInstances; i++) {
        const positionMultiplier = copyCount > 1 ? i + 1 : 1;
        const transformIndex = i; // 1x copy -> 0, 2x copy -> 1, etc.
        verticesToDrag.forEach(p_orig => {
            rawMovingVertices.push({
                ...applyTransform(p_orig, positionMultiplier),
                originalId: p_orig.id,
                transformIndex: transformIndex
            });
        });
    }

    const staticVertices = allVertices
        .filter(p => p.type === 'regular' && !initialDraggedIds.has(p.id))
        .map(p => ({ ...p, originalId: p.id, transformIndex: undefined }));

    const originalMovingEdges = allEdges.filter(e => initialDraggedIds.has(e.id1) && initialDraggedIds.has(e.id2));

    const rawMovingEdges = [];
    for (let i = 0; i < numMovingInstances; i++) {
        const currentCopyVertices = rawMovingVertices.filter(v => v.transformIndex === i);
        originalMovingEdges.forEach(edge => {
            const p1Copy = currentCopyVertices.find(v => v.originalId === edge.id1);
            const p2Copy = currentCopyVertices.find(v => v.originalId === edge.id2);
            if (p1Copy && p2Copy) {
                rawMovingEdges.push({ p1: p1Copy, p2: p2Copy, originalEdge: edge, transformIndex: i });
            }
        });
    }

    const staticEdges = allEdges
        .filter(e => !initialDraggedIds.has(e.id1) || !initialDraggedIds.has(e.id2))
        .map(edge => ({ p1: findVertexById(edge.id1), p2: findVertexById(edge.id2), originalEdge: edge, transformIndex: undefined }))
        .filter(e => e.p1 && e.p2);

    let allTargetVertices = staticVertices;
    let allTargetEdges = staticEdges;

    if (copyCount > 1) {
        const originalSelectionAsTargets = verticesToDrag.map(v => ({...v, originalId: v.id, transformIndex: -1 }));
        allTargetVertices = [...staticVertices, ...originalSelectionAsTargets];
        const originalEdgesAsTargets = originalMovingEdges.map(e=>({p1:findVertexById(e.id1), p2:findVertexById(e.id2), originalEdge: e, transformIndex: -1}));
        allTargetEdges = [...staticEdges, ...originalEdgesAsTargets];
    }

    const vvCandidates = findAllVertexMerges(rawMovingVertices, allTargetVertices, snapRadius);
    const veCandidates = findVertexToEdgeSnaps(rawMovingVertices, allTargetEdges, snapRadius);
    const inverseEVCandidates = findVertexToEdgeSnaps(allTargetVertices, rawMovingEdges, snapRadius);
    const evCandidates = inverseEVCandidates.map(c => ({
        dist: c.dist,
        sourceEdge: c.targetEdge,
        targetVertex: c.sourceVertex,
        correctionVector: { x: c.sourceVertex.x - c.snapPoint.x, y: c.sourceVertex.y - c.snapPoint.y },
        type: 'edge-to-vertex'
    }));

    const allCandidates = [...vvCandidates, ...veCandidates, ...evCandidates];

    if (allCandidates.length === 0) {
        return { snapped: false, finalTransform: rawTransform, mergePairs: [], edgeSnaps: [] };
    }

    const priorities = { 'vertex-vertex': 1, 'vertex-to-edge': 2, 'edge-to-vertex': 2 };
    allCandidates.sort((a, b) => {
        if (priorities[a.type] !== priorities[b.type]) return priorities[a.type] - priorities[b.type];
        return a.dist - b.dist;
    });

    const bestSnap = allCandidates[0];
    let correction = bestSnap.correctionVector;

    const sourceIndex = bestSnap.sourceVertex ? bestSnap.sourceVertex.transformIndex : bestSnap.sourceEdge.transformIndex;
    const targetIndex = bestSnap.targetVertex ? bestSnap.targetVertex.transformIndex : bestSnap.targetEdge.transformIndex;

    let denominator;
    if (copyCount === 1) {
        denominator = 1;
    } else {
        if (targetIndex === undefined) { 
            denominator = sourceIndex + 1;
        } else {
            denominator = sourceIndex - targetIndex;
        }
    }

    if (Math.abs(denominator) > 1e-9) {
        correction.x /= denominator;
        correction.y /= denominator;
    } else {
        correction = { x: 0, y: 0 };
    }

    const finalTransform = { ...rawTransform, delta: { x: rawTransform.delta.x + correction.x, y: rawTransform.delta.y + correction.y } };

    const finalMovingVertices = [];
    for (let i = 0; i < numMovingInstances; i++) {
        const positionMultiplier = copyCount > 1 ? i + 1 : 1;
        const transformIndex = i;
        verticesToDrag.forEach(p_orig => {
            finalMovingVertices.push({
                id: `temp_${p_orig.id}_${i}`,
                ...applyTransform(p_orig, positionMultiplier, finalTransform),
                originalId: p_orig.id,
                transformIndex: transformIndex,
                type: 'regular'
            });
        });
    }

    const finalAllVertices = [...allTargetVertices, ...finalMovingVertices];

    const finalMergeCandidates = findAllVertexMerges(finalMovingVertices, finalAllVertices, C.GEOMETRY_CALCULATION_EPSILON);

    const finalMovingEdges = [];
    for (let i = 0; i < numMovingInstances; i++) {
        const currentCopyVertices = finalMovingVertices.filter(v => v.transformIndex === i);
        originalMovingEdges.forEach(edge => {
            const p1Copy = currentCopyVertices.find(v => v.originalId === edge.id1);
            const p2Copy = currentCopyVertices.find(v => v.originalId === edge.id2);
            if (p1Copy && p2Copy) {
                finalMovingEdges.push({ p1: p1Copy, p2: p2Copy, originalEdge: edge, transformIndex: i });
            }
        });
    }

    const finalVeSnaps = findVertexToEdgeSnaps(finalMovingVertices, [...allTargetEdges, ...finalMovingEdges], C.GEOMETRY_CALCULATION_EPSILON);
    const finalEvSnaps = findVertexToEdgeSnaps(allTargetVertices, finalMovingEdges, C.GEOMETRY_CALCULATION_EPSILON);

    return {
        snapped: true,
        finalTransform: finalTransform,
        bestSnap: bestSnap,
        mergePairs: finalMergeCandidates.map(c => ({
            source: { originalId: c.sourceVertex.originalId, transformIndex: c.sourceVertex.transformIndex },
            target: { originalId: c.targetVertex.originalId, transformIndex: c.targetVertex.transformIndex }
        })),
        edgeSnaps: [...finalVeSnaps, ...finalEvSnaps].map(c => ({
            sourceVertex: { originalId: c.sourceVertex.originalId, transformIndex: c.sourceVertex.transformIndex },
            targetEdge: { originalEdgeId: U.getEdgeId(c.targetEdge.originalEdge), transformIndex: c.targetEdge.transformIndex }
        }))
    };
}

export function getSnapResult(
    initialDragVertexStates,
    allVertices,
    allEdges,
    findVertexById,
    rawDelta,
    copyCount,
    viewTransform
) {
    const rawTransform = { delta: rawDelta };
    const applyTransform = (vertex, multiplier, transform = rawTransform) => {
        return {
            x: vertex.x + transform.delta.x * multiplier,
            y: vertex.y + transform.delta.y * multiplier,
        };
    };

    const result = getGeneralSnapResult(
        initialDragVertexStates,
        allVertices,
        allEdges,
        findVertexById,
        copyCount,
        viewTransform,
        rawTransform,
        applyTransform
    );
    
    return {
        snapped: result.snapped,
        finalDelta: result.finalTransform.delta,
        bestSnap: result.bestSnap,
        mergePairs: result.mergePairs,
        edgeSnaps: result.edgeSnaps
    };
}