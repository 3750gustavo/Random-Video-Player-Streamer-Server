// backend/server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const cors = require('cors');

// Configurar ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

// Configurações
const PORT = 3000;
const CONFIG_PATH = path.join(__dirname, 'config', 'video_paths.json');
const TIME_PER_CLIP = 10;

// Inicialização do Express
const app = express();
app.use(cors()); // Permitir CORS durante o desenvolvimento
app.use(express.static(path.join(__dirname, '../frontend'))); // Servir os arquivos estáticos do frontend

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
    }
});

// Variável global para armazenar a lista de vídeos
let videoList = [];

// Estado de playback
let isPlaying = false;
let playbackLoop = null;
let GoDMode = true;

// Função para carregar caminhos do arquivo de configuração
function loadVideoPaths() {
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        return {
            paths: config.paths.map(p => path.normalize(p)),
            includeSubfolders: config.include_subfolders
        };
    } catch (err) {
        console.error('Erro ao carregar caminhos dos vídeos:', err);
        return { paths: [], includeSubfolders: true };
    }
}

// Função para ler arquivos recursivamente
function readVideos(dirs, includeSubfolders, fileList = []) {
    dirs.forEach(dir => {
        try {
            const normalizedDir = path.normalize(dir);
            const files = fs.readdirSync(normalizedDir);
            files.forEach(file => {
                const filepath = path.join(normalizedDir, file);
                const stat = fs.statSync(filepath);
                if (stat.isDirectory() && includeSubfolders) {
                    readVideos([filepath], includeSubfolders, fileList);
                } else {
                    const ext = path.extname(file).toLowerCase();
                    if (ext === '.mp4' || ext === '.m4a') {
                        fileList.push(filepath);
                    }
                }
            });
        } catch (err) {
            console.error(`Erro ao ler diretório ${dir}:`, err);
        }
    });
    return fileList;
}

// Função para obter duração do vídeo em segundos
function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration;
                resolve(duration);
            }
        });
    });
}

// Função de inicialização para ler todos os vídeos
function initializeVideoList() {
    try {
        const { paths, includeSubfolders } = loadVideoPaths();
        if (paths.length === 0) {
            console.warn('Nenhum caminho de vídeo configurado. Use a ferramenta de gerenciamento de caminhos para adicionar diretórios.');
            return;
        }
        videoList = readVideos(paths, includeSubfolders);
        console.log(`Total de vídeos encontrados: ${videoList.length}`);
    } catch (err) {
        console.error('Erro ao ler os vídeos:', err);
    }
}

// Função para selecionar um vídeo aleatório e um timestamp
async function selectRandomVideo() {
    if (videoList.length === 0) {
        console.warn('Nenhum vídeo disponível na lista.');
        return null;
    }

    const randomIndex = Math.floor(Math.random() * videoList.length);
    const selectedVideo = videoList[randomIndex];

    try {
        const duration = await getVideoDuration(selectedVideo);
        if (duration <= TIME_PER_CLIP + 1) {
            return { path: selectedVideo, timestamp: 0 };
        }
        const maxTimestamp = duration - TIME_PER_CLIP + 1;
        const randomTimestamp = Math.floor(Math.random() * maxTimestamp);
        return { path: selectedVideo, timestamp: randomTimestamp };
    } catch (err) {
        console.error(`Erro ao obter duração do vídeo ${selectedVideo}:`, err);
        return null;
    }
}

// Função de loop de playback
async function playbackLoopFunction() {
    if (!isPlaying) return;

    const videoInfo = await selectRandomVideo();
    if (videoInfo) {
        io.emit('video-stream', {
            url: videoInfo.path,  // Use the absolute path directly
            timestamp: videoInfo.timestamp
        });
        console.log(`Enviado vídeo: ${videoInfo.path} com timestamp: ${videoInfo.timestamp}`);
    }
    // Configurar o próximo envio após TIME_PER_CLIP segundos se GoDMode estiver ativado
    if (GoDMode) {
        playbackLoop = setTimeout(playbackLoopFunction, TIME_PER_CLIP * 1000);
    }
}

// Rotas HTTP

// Rota de reset
app.get('/reset', (req, res) => {
    isPlaying = false;
    if (playbackLoop) {
        clearTimeout(playbackLoop);
        playbackLoop = null;
        GoDMode = true;
    }
    res.send({ status: 'resetado' });
    console.log('Playback resetado.');
});

// Rota de start/stop
app.get('/startstop', async (req, res) => {
    isPlaying = !isPlaying;
    if (isPlaying) {
        playbackLoopFunction();
        res.send({ status: 'started' });
        console.log('Playback iniciado.');
    } else {
        if (playbackLoop) {
            clearTimeout(playbackLoop);
            playbackLoop = null;
        }
        res.send({ status: 'stopped' });
        console.log('Playback parado.');
    }
});

// Rota para mudar o vídeo imediatamente (usado pelo botão "Next")
app.get('/changevideo', async (req, res) => {
    if (!GoDMode) {
        const videoInfo = await selectRandomVideo();
        if (videoInfo) {
            io.emit('video-stream', {
                url: videoInfo.path,
                timestamp: videoInfo.timestamp
            });
            console.log(`Enviado vídeo: ${videoInfo.path} com timestamp: ${videoInfo.timestamp}`);
            res.send({ status: 'video changed' });
        } else {
            res.status(500).send({ status: 'error', message: 'No videos available' });
        }
    } else {
        res.status(403).send({ status: 'error', message: 'God Mode is enabled' });
    }
});

// Servir os arquivos de vídeo estáticos com CORS
app.get('/video', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');

    // Decodificar e normalizar o caminho do vídeo
    const videoPath = decodeURIComponent(req.query.path);
    const normalizedPath = path.normalize(videoPath);

    // Validar que o caminho existe em nossas configurações
    const { paths } = loadVideoPaths();
    const isValidPath = paths.some(basePath => {
        const normalizedBasePath = path.normalize(basePath);
        return normalizedPath.startsWith(normalizedBasePath);
    });

    if (!isValidPath) {
        console.log('Access denied for path:', normalizedPath);
        return res.status(403).send('Access denied');
    }

    // Verificar se o arquivo existe
    if (!fs.existsSync(normalizedPath)) {
        console.log('File not found:', normalizedPath);
        return res.status(404).send('File not found');
    }

    // Stream do vídeo
    const stat = fs.statSync(normalizedPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(normalizedPath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(normalizedPath).pipe(res);
    }
});

// Rota para atualizar o estado do GoDMode
app.get('/setgodmode', (req, res) => {
    const { enabled } = req.query;
    if (enabled === 'true' || enabled === 'false') {
        GoDMode = enabled === 'true';
        console.log(`God Mode set to: ${GoDMode}`);
        res.send({ status: 'success', godMode: GoDMode });
    } else {
        res.status(400).send({ status: 'error', message: 'Invalid value for enabled' });
    }
});

// Inicialização do servidor
server.listen(PORT, () => {
    initializeVideoList();
    console.log(`Servidor rodando na porta ${PORT}`);
});

// Resetar o estado ao conectar um novo cliente
io.on('connection', (socket) => {
    console.log('Novo cliente conectado.');

    // Enviar o estado atual para o cliente
    socket.emit('status', { isPlaying });

    // Ouvir eventos do cliente, se necessário
    socket.on('disconnect', () => {
        console.log('Cliente desconectado.');
    });
});