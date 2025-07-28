import os
import re

# --- Configuration ---

# A list of tuples: (file_path, string_to_find, string_to_replace)
# This list now only contains replacements for magic numbers and hardcoded colors.
REPLACEMENTS = [
    # renderer.js replacements
    ("renderer.js", "ctx.globalAlpha = 0.25;", "ctx.globalAlpha = C.FACE_GLOW_ALPHA;"),
    ("renderer.js", "if (tickAlpha < 0.01) return;", "if (tickAlpha < C.POLAR_REF_TICK_ALPHA_THRESHOLD) return;"),
    ("renderer.js", "const finalColor = `rgba(${colors.feedbackDefault.join(',')}, ${tickAlpha * 0.95})`;", "const finalColor = `rgba(${colors.feedbackDefault.join(',')}, ${tickAlpha * C.POLAR_REF_TICK_LABEL_ALPHA_FACTOR})`;"),
    ("renderer.js", "const labelMargin = 100;", "const labelMargin = C.POLAR_REF_LABEL_MARGIN;"),
    ("renderer.js", "ctx.lineWidth = 1.5;", "ctx.lineWidth = C.POLAR_REF_LINE_WIDTH;"),
    ("renderer.js", "ctx.lineWidth = C.GRID_LINEWIDTH * 0.5;", "ctx.lineWidth = C.GRID_LINEWIDTH * C.POLAR_GRID_SPOKE_WIDTH_FACTOR;"),
    ("renderer.js", "const angleText = `${parseFloat(angleDeg.toFixed(4)).toString()}^{\\circ}`;", "const angleText = `${parseFloat(angleDeg.toFixed(C.TRANSFORM_INDICATOR_PRECISION)).toString()}^{\\circ}`;"),
    ("renderer.js", "if (Math.abs(effectiveScale - 1) < 0.001) {", "if (Math.abs(effectiveScale - 1) < C.TRANSFORM_INDICATOR_SCALE_SNAP_TOLERANCE) {"),
    ("renderer.js", "const formattedScale = parseFloat(effectiveScale.toFixed(4)).toString();", "const formattedScale = parseFloat(effectiveScale.toFixed(C.TRANSFORM_INDICATOR_PRECISION)).toString();"),
    ("renderer.js", "'rgba(128, 128, 128, 1)'", "C.UI_COLOR_TARGET_UNASSIGNED"),
    ("renderer.js", "ctx.fillStyle = '#808080';", "ctx.fillStyle = C.UI_ICON_DISABLED_FILL;"),
    ("renderer.js", "ctx.arc(centerScreen.x, centerScreen.y, 4, 0, 2 * Math.PI);", "ctx.arc(centerScreen.x, centerScreen.y, C.FACE_COORD_SYSTEM_ORIGIN_RADIUS, 0, 2 * Math.PI);"),
    ("renderer.js", "ctx.strokeStyle = '#ff0000';", "ctx.strokeStyle = colors.uiIconDisabled;"), # For the disabled icon line
    ("renderer.js", "const checkerboardColor1 = '#808080';", "const checkerboardColor1 = colors.checkerboardColor1;"),
    ("renderer.js", "const checkerboardColor2 = '#c0c0c0';", "const checkerboardColor2 = colors.checkerboardColor2;"),
    ("renderer.js", "const xArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : '#ff0000';", "const xArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : colors.coordSysX;"),
    ("renderer.js", "const yArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : '#00ff00';", "const yArrowColor = coordSystemSnapScale !== null ? colors.feedbackSnapped : colors.coordSysY;"),
    ("renderer.js", "drawArrow(centerScreen, xAxisScreenEnd, '#ff0000', xArrowColor);", "drawArrow(centerScreen, xAxisScreenEnd, xColor, xColor);"), # Corrected logic to use the new variable
    ("renderer.js", "drawArrow(centerScreen, yAxisScreenEnd, '#00ff00', yArrowColor);", "drawArrow(centerScreen, yAxisScreenEnd, yColor, yColor);"), # Corrected logic to use the new variable
    ("renderer.js", "ctx.fillStyle = '#0000ff';", "ctx.fillStyle = colors.coordSysOrigin;"),


    # script.js replacements
    ("script.js", "if (bestSnap.priority < 0.1) {", "if (bestSnap.priority < C.TRANSFORM_SCALE_SNAP_PRIORITY_THRESHOLD) {"),

    # utils.js replacements
    ("utils.js", "const centerSelectRadius = 8;", "const centerSelectRadius = C.COORD_SYSTEM_ELEMENT_SELECT_RADIUS;"),
    ("utils.js", "const armSelectThreshold = 5;", "const armSelectThreshold = C.COORD_SYSTEM_AXIS_SELECT_THRESHOLD;"),
    ("utils.js", "const snapThreshold = Math.PI / 24; // About 7.5 degrees", "const snapThreshold = C.COORD_SYSTEM_AXIS_SNAP_THRESHOLD_RAD;"),
    ("utils.js", "const pixelSnapThreshold = 15 / viewTransform.scale;", "const pixelSnapThreshold = C.COORD_SYSTEM_AXIS_SCALE_SNAP_THRESHOLD_PIXELS / viewTransform.scale;"),
    ("utils.js", "const fractions = [0, 0.25, 1/3, 0.5, 2/3, 0.75, 1];", "const fractions = C.COORD_SYSTEM_CENTER_EDGE_SNAP_FRACTIONS;"),
]


# --- Main Script Logic ---

def perform_replacements():
    """Iterates through the configuration and replaces strings in files."""
    print("--- Starting File Replacements ---\n")
    
    # Handle simple string replacements
    for file_path, find_str, replace_str in REPLACEMENTS:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Use regex for more robust replacement of whole lines/phrases
            # This helps avoid replacing substrings incorrectly
            # We escape the find_str to treat it as a literal string in the regex
            find_regex = re.escape(find_str)
            
            if re.search(find_regex, content):
                new_content = re.sub(find_regex, replace_str, content)
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"✅ Replaced in '{file_path}':\n   -'{find_str}'\n   +'{replace_str}'\n")
            else:
                print(f"⚠️  String not found in '{file_path}': '{find_str}'")

        except FileNotFoundError:
            print(f"❌ ERROR: File not found: {file_path}")
        except Exception as e:
            print(f"❌ ERROR processing {file_path}: {e}")
            
    print("\n--- Refactoring Complete ---")


if __name__ == "__main__":
    # Verify we are in the correct directory
    if os.path.exists('script.js') and os.path.exists('constants.js'):
        perform_replacements()
    else:
        print("❌ ERROR: This script must be run from the root of your project directory.")
        print("         (The directory containing 'script.js', 'index.html', etc.)")
