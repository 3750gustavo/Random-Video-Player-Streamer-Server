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
        const fileList = readVideos(paths, includeSubfolders);
        videoList = fileList.reduce((acc, path, index) => ({ ...acc, [index]: path }), {});
        console.log(`Total de vídeos encontrados: ${Object.keys(videoList).length}`);
    } catch (err) {
        console.error('Erro ao ler os vídeos:', err);
    }
}

// Função para selecionar um vídeo aleatório e um timestamp
async function selectRandomVideo() {
    if (Object.keys(videoList).length === 0) {
        console.warn('Nenhum vídeo disponível na lista.');
        return null;
    }

    const randomIndex = Math.floor(Math.random() * Object.keys(videoList).length);
    const selectedVideoPath = videoList[randomIndex];

    try {
        const duration = await getVideoDuration(selectedVideoPath);
        if (duration <= TIME_PER_CLIP + 1) {
            return { index: randomIndex, timestamp: 0 };
        }
        const maxTimestamp = duration - TIME_PER_CLIP + 1;
        const randomTimestamp = Math.floor(Math.random() * maxTimestamp);
        return { index: randomIndex, timestamp: randomTimestamp };
    } catch (err) {
        console.error(`Erro ao obter duração do vídeo ${selectedVideoPath}:`, err);
        return null;
    }
}

// Função de loop de playback
async function playbackLoopFunction() {
    if (!isPlaying) return;

    const videoInfo = await selectRandomVideo();
    if (videoInfo) {
        io.emit('video-stream', {
            index: videoInfo.index,  // Use the index instead of the path
            timestamp: videoInfo.timestamp
        });
        console.log(`Enviado vídeo: ${videoList[videoInfo.index]} com timestamp: ${videoInfo.timestamp}`);
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
                index: videoInfo.index,  // Use the index instead of the path
                timestamp: videoInfo.timestamp
            });
            console.log(`Enviado vídeo: ${videoList[videoInfo.index]} com timestamp: ${videoInfo.timestamp}`);
            res.send({ status: 'video changed' });
        } else {
            res.status(500).send({ status: 'error', message: 'No videos available' });
        }
    } else {
        res.status(403).send({ status: 'error', message: 'God Mode is enabled' });
    }
});

// Rota para servir vídeos com streaming
app.get('/video', async (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');

    try {
        const index = req.query.index;
        if (index === undefined || !Object.keys(videoList).includes(index)) {
            console.log(`Índice inválido: ${index}`);
            return res.status(404).send('Índice inválido');
        }

        const videoPath = videoList[index];
        const normalizedPath = path.normalize(videoPath);

        // Carregar configurações de caminhos
        const { paths } = loadVideoPaths();

        // Verificar se o caminho está nas pastas permitidas
        const isValidPath = paths.some(basePath => {
            const normalizedBase = path.normalize(basePath);
            return normalizedPath.startsWith(normalizedBase);
        });

        if (!isValidPath) {
            console.log(`Acesso negado ao caminho: ${normalizedPath}`);
            return res.status(403).send('Acesso negado');
        }

        // Verificar se o arquivo existe
        if (!fs.existsSync(normalizedPath)) {
            console.log(`Arquivo não encontrado: ${normalizedPath}`);
            return res.status(404).send('Arquivo não encontrado');
        }

        // Configurar cabeçalho Content-Type correto
        const ext = path.extname(normalizedPath).toLowerCase();
        const contentType = ext === '.mp4' ? 'video/mp4' :
                           ext === '.m4a' ? 'video/mp4' : // M4A geralmente é aceito como mp4
                           'video/*'; // Fallback genérico

        // Streaming do vídeo
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
                'Content-Type': contentType,
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
            };
            res.writeHead(200, head);
            fs.createReadStream(normalizedPath).pipe(res);
        }
    } catch (error) {
        console.error(`Erro ao servir vídeo no índice ${req.query.index}:`, error);
        res.status(500).send('Erro ao processar o vídeo');
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