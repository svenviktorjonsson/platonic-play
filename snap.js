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
    const vvSnapRadius = (C.VERTEX_RADIUS * 2) / viewTransform.scale;
    const veSnapRadius = C.VERTEX_RADIUS / viewTransform.scale;

    const regularTypeString = String(C.VERTEX_TYPE_REGULAR).trim();
    const verticesToDrag = initialDragVertexStates.filter(p => {
        const vertexTypeString = p && p.type ? String(p.type).trim() : 'undefined';
        return vertexTypeString === regularTypeString;
    });

    if (verticesToDrag.length === 0 || copyCount <= 0) {
        return { snapped: false, finalTransform: rawTransform, mergePairs: [], edgeSnaps: [] };
    }

    const initialDraggedIds = new Set(initialDragVertexStates.map(p => p.id));

    const rawMovingVertices = [];
    // This loop effectively runs 1 to N-1 (or just 1 if N=1) due to the increment line
    for (let i = 0; i < copyCount; i++) {
        i += copyCount == 1; // Added line

        // Check condition again after potential increment
        if (i >= copyCount) break; // Break needed if increment makes 'i' invalid for this iteration

        const positionMultiplier = i;
        const transformIndex = i;

        verticesToDrag.forEach(p_orig => {
            rawMovingVertices.push({
                ...applyTransform(p_orig, positionMultiplier, rawTransform),
                originalId: p_orig.id,
                transformIndex: transformIndex,
                type: 'regular'
            });
        });
    }


    const staticVertices = allVertices
        .filter(p => p.type === 'regular' && !initialDraggedIds.has(p.id))
        .map(p => ({ ...p, originalId: p.id, transformIndex: undefined }));

    const originalMovingEdges = allEdges.filter(e => initialDraggedIds.has(e.id1) && initialDraggedIds.has(e.id2));

    const rawMovingEdges = [];
     // This loop effectively runs 1 to N-1 (or just 1 if N=1)
     for (let i = 0; i < copyCount; i++) {
        i += copyCount == 1; // Added line
        if (i >= copyCount) break; // Break needed

        const transformIndex = i;

        const currentCopyVertices = rawMovingVertices.filter(v => v.transformIndex === transformIndex);
        // Add check if currentCopyVertices is empty (can happen if loop was skipped/broken early)
        if (currentCopyVertices.length > 0) {
            originalMovingEdges.forEach(edge => {
                const p1Copy = currentCopyVertices.find(v => v.originalId === edge.id1);
                const p2Copy = currentCopyVertices.find(v => v.originalId === edge.id2);
                if (p1Copy && p2Copy) {
                    rawMovingEdges.push({ p1: p1Copy, p2: p2Copy, originalEdge: edge, transformIndex: transformIndex, originalEdgeId: U.getEdgeId(edge) });
                }
            });
        }
    }

    const staticEdges = allEdges
        .filter(e => !initialDraggedIds.has(e.id1) || !initialDraggedIds.has(e.id2))
        .map(edge => ({ p1: findVertexById(edge.id1), p2: findVertexById(edge.id2), originalEdge: edge, transformIndex: undefined, originalEdgeId: U.getEdgeId(edge) }))
        .filter(e => e.p1 && e.p2);

    // Targets now only include static (undefined) and copies (1..N-1 or just 1)
    const allTargetVertices = [...staticVertices, ...rawMovingVertices];
    const allTargetEdges = [...staticEdges, ...rawMovingEdges];

    // Check moving copies (1..N-1 or just 1) against all targets
    const vvCandidates = findAllVertexMerges(rawMovingVertices, allTargetVertices, vvSnapRadius);
    const veCandidates = findVertexToEdgeSnaps(rawMovingVertices, allTargetEdges, veSnapRadius);
    // Check static vertices (undefined) against moving edges (1..N-1 or just 1)
    const inverseEVCandidates = findVertexToEdgeSnaps(staticVertices, rawMovingEdges, veSnapRadius);

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
        const priorityA = priorities[a.type] ?? 99;
        const priorityB = priorities[b.type] ?? 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        return a.dist - b.dist;
    });
    const bestSnap = allCandidates[0];

    let correction = { ...bestSnap.correctionVector };
    const sourceIndex = bestSnap.sourceVertex ? bestSnap.sourceVertex.transformIndex : bestSnap.sourceEdge.transformIndex; // Index >= 1
    const targetIndex = bestSnap.targetVertex ? bestSnap.targetVertex.transformIndex : (bestSnap.targetEdge ? bestSnap.targetEdge.transformIndex : undefined); // Index >= 1 or undefined

    let denominator;
    if (targetIndex === undefined) {
        denominator = sourceIndex;
    } else {
        denominator = sourceIndex - targetIndex;
    }

    let correction_step = { x: 0, y: 0 };
    if (Math.abs(denominator) > 1e-9) {
        correction_step.x = correction.x / denominator;
        correction_step.y = correction.y / denominator;
    } else {
        correction_step = { x: 0, y: 0 }; // k snaps to k
    }

    const finalTransform = { ...rawTransform, delta: { x: rawTransform.delta.x + correction_step.x, y: rawTransform.delta.y + correction_step.y } };

    // Recalculate Final Positions using the corrected finalTransform for indices 1 to N-1 (or just 1)
    const finalMovingVertices = [];
     for (let i = 0; i < copyCount; i++) {
        i += copyCount == 1; // Added line
        if (i >= copyCount) break; // Break needed

        const positionMultiplier = i;
        const transformIndex = i;

         verticesToDrag.forEach(p_orig => {
             finalMovingVertices.push({
                 ...applyTransform(p_orig, positionMultiplier, finalTransform),
                 id: `final_${p_orig.id}_${i}`,
                 originalId: p_orig.id,
                 transformIndex: transformIndex,
                 type: 'regular'
             });
         });
    }


    // Final Merge/Split Checks (using indices >= 1 and undefined)
    const finalStaticVerticesForCheck = staticVertices.map(v => ({...v}));
    const finalAllVerticesForCheck = [...finalStaticVerticesForCheck, ...finalMovingVertices];
    const finalMergeCandidates = findAllVertexMerges(finalMovingVertices, finalAllVerticesForCheck, C.GEOMETRY_CALCULATION_EPSILON);

    const finalStaticEdgesForSplitCheck = staticEdges.map(e => ({...e}));
    const finalMovingEdgesForSplitCheck = [];
    for (let i = 0; i < copyCount; i++) {
         i += copyCount == 1; // Added line
         if (i >= copyCount) break; // Break needed

        const transformIndex = i;

        const currentCopyVertices = finalMovingVertices.filter(v => v.transformIndex === transformIndex);
        if (currentCopyVertices.length > 0) {
            originalMovingEdges.forEach(edge => {
                const p1Copy = currentCopyVertices.find(v => v.originalId === edge.id1);
                const p2Copy = currentCopyVertices.find(v => v.originalId === edge.id2);
                if (p1Copy && p2Copy) {
                    finalMovingEdgesForSplitCheck.push({ p1: p1Copy, p2: p2Copy, originalEdge: edge, transformIndex: transformIndex, originalEdgeId: U.getEdgeId(edge) });
                }
            });
        }
    }
    const finalAllTargetEdgesForSplitCheck = [...finalStaticEdgesForSplitCheck, ...finalMovingEdgesForSplitCheck];

    const finalVeSnaps = findVertexToEdgeSnaps(finalMovingVertices, finalAllTargetEdgesForSplitCheck, C.GEOMETRY_CALCULATION_EPSILON);
    const finalEvSnaps = findVertexToEdgeSnaps(finalStaticVerticesForCheck, finalMovingEdgesForSplitCheck, C.GEOMETRY_CALCULATION_EPSILON);


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
            targetEdge: { originalEdgeId: c.targetEdge.originalEdgeId, transformIndex: c.targetEdge.transformIndex }
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