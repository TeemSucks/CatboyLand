import os

def add_png_extension(folder_path):
    # Check if the path is a directory
    if not os.path.isdir(folder_path):
        print(f"Error: {folder_path} is not a valid directory.")
        return
    
    # Get a list of all files in the directory
    files = os.listdir(folder_path)
    
    for file in files:
        # Combine the folder path with each file name
        file_path = os.path.join(folder_path, file)
        
        # Check if the item is a file
        if os.path.isfile(file_path):
            # Rename the file by adding ".png" extension
            new_file_path = file_path + ".png"
            os.rename(file_path, new_file_path)
            print(f"Renamed: {file} to {file}.png")

if __name__ == "__main__":
    # Replace '/path/to/your/folder' with the path to your folder
    folder_path = '/Users/mark/Library/Application Support/discord/Cache/Cache_Data'
    add_png_extension(folder_path)
