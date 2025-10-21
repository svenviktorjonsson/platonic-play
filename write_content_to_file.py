import os

# --- Configuration ---

# !!! CHANGE THIS VARIABLE TO THE DESIRED STARTING DIRECTORY !!!
# Example: root = "/path/to/your/project" or root = "src"
root = fr"./"

# Extensions to include in the output
extensions = ('.py',".html",".js",".css", '.json', '.md', '.txt','.toml','.mbar','.ico','.ps1')

# Directories and patterns to exclude entirely (will not be walked)
exclude_dirs = (
    '.git',
    '__pycache__',
    '.pytest_cache',
    'dist',
    'tests',
    'logs',
    "node_modules"
)

# Files to exclude from the tree and content entirely by exact match
exclude_exact_filenames = (
    'write_content_to_file.py',
    'project_content.txt',
)

# Files to exclude from the tree and content if their name contains any of these strings
exclude_filename_patterns = ('lock',)

# Specific files to list in the tree but exclude their *content* from the output
exclude_files = (
    'session.json',
    'cm_logo.ico',
)

# Output file name
output_filename = "project_content.txt"

# --- Script Logic ---

# Normalize the root path and make it absolute for reliable comparisons
root = os.path.abspath(root)

print(f"Starting directory: {root}")
print(f"Output file: {output_filename}")

# The instructions to be added at the end of the file
llm_instructions = """
=== LLM Instructions ===
Always explain what you changed exactly and then provide always COMPLETE functions WITHOUT comments or placeholders.

For very large functions >200 lines please make sure to write a complete conditional scope a indentation in python or {replace all of this} in javascript.

In html you always write the full file since these files are small. For CSS write complete sections.

Always seek confirmation before writing code and write 1-5 functions at the time one in each code block.

For class methods make sure to use 4 extra spaces att the start of each line except the first one ( function name line).

DONT use the Canvas Artifact, only write in codeblocks directly in the chat.

Please just Read this and confirm that you have read and understood the rules, then just wait for instructions!
"""


try:
    # Using "w" mode ensures the file is overwritten if it exists
    with open(output_filename, "w", encoding="utf-8") as outfile:
        # === Add Directory Structure ===
        outfile.write("=== Project Directory Structure ===\n")
        outfile.write(f"Root: {root}\n")
        outfile.write("Relevant files and folders (excluding specified patterns):\n\n")

        start_level = root.count(os.sep)
        for current_root, dirs, files in os.walk(root, topdown=True):
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            rel_path_from_start = os.path.relpath(current_root, root)
            level = current_root.count(os.sep) - start_level

            if rel_path_from_start != '.':
                path_components = os.path.normpath(rel_path_from_start).split(os.sep)
                if any(comp in exclude_dirs or comp.startswith('.') for comp in path_components):
                    continue

                indent = '│   ' * (level - 1) + '├── ' if level > 0 else ''
                outfile.write(f"{indent}{os.path.basename(current_root)}/\n")
            else:
                outfile.write(".\n")

            file_indent = '│   ' * level + '├── '
            files.sort()
            for file in files:
                # Apply all file exclusion rules
                if (file.endswith(extensions) and
                    not file.startswith('.') and
                    file not in exclude_exact_filenames and
                    not any(p in file for p in exclude_filename_patterns)):
                        outfile.write(f"{file_indent}{file}\n")

        outfile.write("\n\n=== File Contents ===\n\n")

        # === Add File Contents ===
        for current_root, dirs, files in os.walk(root, topdown=True):
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            rel_path_from_start = os.path.relpath(current_root, root)
            if rel_path_from_start != '.':
                path_components = os.path.normpath(rel_path_from_start).split(os.sep)
                if any(comp in exclude_dirs or comp.startswith('.') for comp in path_components):
                    continue

            files.sort()
            for file in files:
                # Apply all file exclusion rules again for content processing
                if (file.endswith(extensions) and
                    not file.startswith('.') and
                    file not in exclude_exact_filenames and
                    not any(p in file for p in exclude_filename_patterns)):
                        file_path = os.path.join(current_root, file)
                        relative_path = os.path.relpath(file_path, root)
                        display_path = relative_path.replace(os.sep, '/')
                        outfile.write(f"=== {display_path} ===\n")

                        if file in exclude_files:
                            outfile.write("--- CONTENT EXCLUDED (listed in exclude_files) ---\n")
                        else:
                            try:
                                try:
                                    with open(file_path, "r", encoding="utf-8") as infile:
                                        outfile.write(infile.read())
                                except UnicodeDecodeError:
                                    try:
                                        with open(file_path, "r", encoding="latin-1") as infile:
                                            outfile.write(infile.read())
                                        outfile.write("\n--- (Warning: Read using latin-1 encoding) ---\n")
                                    except Exception as inner_e:
                                        outfile.write(f"--- Error reading file (fallback failed): {inner_e} ---\n")
                            except Exception as e:
                                outfile.write(f"--- Error reading file: {e} ---\n")
                        outfile.write("\n\n")

        # === Add LLM Instructions at the end of the file ===
        outfile.write(llm_instructions)

    print("Successfully generated project content file.")

except Exception as e:
    print(f"An error occurred: {e}")