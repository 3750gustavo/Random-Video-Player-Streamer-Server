# Random Video Player Streamer Server
---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How to Use](#how-to-use)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Usage](#usage)
- [GoD Mode vs Normal Mode](#god-mode-vs-normal-mode) [NEW]
- [Technology Stack](#technology-stack)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## Overview

Imagine a Web APP that plays random videos at random starting points from your pc that you can access from another machine or even your phone. This is exactly what this project is about, it's all about breaking the client-server paradigm.

## Features

- Randomly selects and plays video clips at random timestamps from specified directories.
- Has an easy-to-use Python tool for adding and removing video directories to the server.
- Recursively searches for video files in the specified directories.
- Streams 10-second segments of videos to connected clients.
- Supports two modes: God Mode and Normal Mode, more details in [GoD Mode vs Normal Mode](#god-mode-vs-normal-mode)

## How to Use

### Prerequisites

- Node.js
- Python (You can just edit the paths manually if you prefer, format example below)
- FFmpeg (automatically installed via ffmpeg-static)

### Installation

1. Clone the repository:
2. Access the Backend directory (ex: `cd Backend`)
3. Install dependencies:
   ```bash
   npm ci
   ```
    or from the root of the project:
    ```bash
    npm ci --prefix Backend
    ```
4. Before running the server, you need to either:
   - Use the Python tool to add and remove video directories to the server, it will automatically create a Config folder inside the Backend directory with a config.json file inside it with the paths to the directories you added through the tool.
   - Manually create a Config folder inside the Backend directory with a config.json file inside it with the paths to the directories you want to use. The format should be as follows:
     ```json
     {
        "paths": [
            "path/to/directory1",
            "path/to/directory2",
            "path/to/directory3"
        ]
     }
     ```
5. Open the `index.html` inside the Frontend directory in the text editor of your choice and change the `ipAddress` constant to the IP address of your machine running the server so that it end up looking like this: `const ipAddress = "http://192.168.0.120:3000";` replacing the "192.168.0.120" with your own IP address.
6. To run the server you can just go back to the Backend directory inside the terminal and run `node server.js` or at the root of the project run `node Backend/server.js`

### Usage

1. Run the server using `node server.js` while inside the Backend directory or `node Backend/server.js` at the root of the project.
2. By now the server should be running, and you should be able to access the frontend by going to `http://your-ip-address:3000` in your browser.

## GoD Mode vs Normal Mode

The server has two modes: GoD Mode and Normal Mode.

- **GoD Mode:** In this mode, the server will automatically play a new video every 10 seconds. This mode is enabled by default when the server starts, its called god mode because the server has god powers over the client, it can play any video at any time without the client having anything to say about it.
- **Normal Mode:** In this mode, the server will only play a new video when the client requests it. The videos are still just as random as in GoD Mode, but the client has more control over when the videos are played.

## Technology Stack

* **Backend:**
  - `Node.js`
  - `Express.js`
  - `FFmpeg` (via ffmpeg-static)
  - `Socket.IO`
  - `CORS`
* **Frontend:**
  - `HTML5`
  - `CSS` (Bootstrap 5)
  - `JavaScript`
  - `Socket.IO` and `Bootstrap 5` CDNs with integrity checks for extra safety
* **Python Tool:**
  - `Tkinter`
  - `json` and `os` for handling the path config file data

## Contributing

Contributions are welcome! If you have any suggestions, bug reports, or feature requests, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

This project was inspired by my love for randomness and making multimedia apps, as a way to push the limits, most of the time when we talk about backend and frontend, its the user making requests and the server just responding to them, but what if the user just watched and the server was the one making the swift changes?

So, I made this project to explore this idea and see if it was possible to reverse the traditional client-server logic and have the server make decisions and changes without any user interaction beyond pressing the start button.
