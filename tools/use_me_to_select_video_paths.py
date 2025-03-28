# tools/use_me_to_select_video_paths.py

import tkinter as tk
from tkinter import filedialog, ttk, messagebox
import json
import os

CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend", "config", "video_paths.json"))

class PathManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Video Paths Manager")

        # Create main frame
        self.frame = ttk.Frame(root, padding="10")
        self.frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        # Create listbox for paths with scrollbar
        self.scrollbar = ttk.Scrollbar(self.frame)
        self.scrollbar.grid(row=0, column=2, sticky=(tk.N, tk.S))

        self.paths_listbox = tk.Listbox(
            self.frame,
            width=60,
            selectmode=tk.EXTENDED,
            yscrollcommand=self.scrollbar.set
        )
        self.paths_listbox.grid(row=0, column=0, columnspan=2, pady=5)
        self.scrollbar.config(command=self.paths_listbox.yview)

        # Create buttons
        ttk.Button(self.frame, text="Add Path", command=self.add_path).grid(row=1, column=0, pady=5)
        ttk.Button(self.frame, text="Delete Selected", command=self.delete_paths).grid(row=1, column=1, pady=5)

        # Create checkbox for include_subfolders
        self.include_subfolders_var = tk.BooleanVar()
        ttk.Checkbutton(self.frame, text="Include Subfolders", variable=self.include_subfolders_var, command=self.save_paths).grid(row=2, column=0, columnspan=2, pady=5)

        # Initialize paths storage
        self.paths = set()

        # Load existing paths and settings
        self.load_paths()

    def load_paths(self):
        try:
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, 'r') as f:
                    data = json.load(f)
                    self.paths = set()
                    self.paths_listbox.delete(0, tk.END)
                    for path in data.get('paths', []):
                        # Convert to Windows path format and normalize
                        normalized_path = os.path.normpath(path)
                        if os.path.exists(normalized_path):
                            self.paths.add(normalized_path)
                            self.paths_listbox.insert(tk.END, normalized_path)
                        else:
                            messagebox.showwarning(
                                "Invalid Path",
                                f"Path not found and will be removed: {normalized_path}"
                            )
                    self.include_subfolders_var.set(data.get('include_subfolders', True))
            self.save_paths()  # Save to remove any invalid paths
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load paths: {str(e)}")
            self.paths = set()
            self.include_subfolders_var.set(True)
            self.save_paths()

    def save_paths(self):
        try:
            os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
            with open(CONFIG_PATH, 'w') as f:
                # Always save paths using forward slashes for consistency
                paths_to_save = [p.replace('\\', '/') for p in self.paths]
                json.dump({
                    'paths': sorted(paths_to_save),
                    'include_subfolders': self.include_subfolders_var.get()
                }, f, indent=4)
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save paths: {str(e)}")

    def add_path(self):
        path = filedialog.askdirectory()
        if path:
            normalized_path = os.path.normpath(path)
            if normalized_path not in self.paths:
                self.paths.add(normalized_path)
                self.paths_listbox.delete(0, tk.END)
                for p in sorted(self.paths):
                    self.paths_listbox.insert(tk.END, p)
                self.save_paths()

    def delete_paths(self):
        selected = self.paths_listbox.curselection()
        paths_to_remove = [self.paths_listbox.get(idx) for idx in selected]
        for path in paths_to_remove:
            self.paths.discard(path)

        self.paths_listbox.delete(0, tk.END)
        for path in sorted(self.paths):
            self.paths_listbox.insert(tk.END, path)
        self.save_paths()

if __name__ == "__main__":
    root = tk.Tk()
    app = PathManagerApp(root)
    root.mainloop()