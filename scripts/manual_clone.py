
import os
import hashlib
import sys
import subprocess

def clone_repo(source_url, target_base_dir='backend/repo_data'):
    """
    Clones a repository into the target directory using the same naming convention
    as the Zuul Visualizer backend.
    """
    if not source_url:
        print("Error: Source URL is required.")
        return

    # Normalize URL for hashing (remove .git and trailing slashes) to ensure uniqueness
    normalized_source = source_url.strip().rstrip('/')
    if normalized_source.endswith('.git'):
        normalized_source = normalized_source[:-4]

    # Create a directory name based on the repo name or hash to avoid collisions and be readable
    repo_name = normalized_source.split('/')[-1]
    # Add hash to ensure uniqueness if multiple repos have same name
    url_hash = hashlib.md5(normalized_source.encode()).hexdigest()[:8]
    target_dir_name = f"{repo_name}_{url_hash}"
    
    # Ensure base dir exists relative to script execution or absolute
    # We assume this script is run from project root, so 'backend/repo_data'
    abs_base_dir = os.path.abspath(target_base_dir)
    target_path = os.path.join(abs_base_dir, target_dir_name)
    
    print(f"Target path: {target_path}")

    if os.path.exists(target_path):
        print(f"Directory already exists: {target_path}")
        print("Pulling latest changes...")
        try:
            subprocess.check_call(['git', '-C', target_path, 'pull'])
            print("Successfully updated.")
        except subprocess.CalledProcessError as e:
            print(f"Error updating repo: {e}")
    else:
        print(f"Cloning {source_url}...")
        try:
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            subprocess.check_call(['git', 'clone', source_url, target_path])
            print("Successfully cloned.")
        except subprocess.CalledProcessError as e:
            print(f"Error cloning repo: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/manual_clone.py <git_url>")
        print("Example: python scripts/manual_clone.py https://github.com/zuul/zuul")
        sys.exit(1)
        
    url = sys.argv[1]
    clone_repo(url)
