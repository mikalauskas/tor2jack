import express from 'express';
const port = 3000;
import path from 'path';
import WebTorrent from 'webtorrent';
import exphbs from 'express-handlebars';
import axios from 'axios';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set up handlebars as the view engine
const app = express();
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

// Specify the path to your views directory
app.set('views', path.join(__dirname, 'views'));

// Serve static files from the 'public' directory
//app.use(express.static(path.join(__dirname, 'public')));

// Set up the WebTorrent client
const client = new WebTorrent();
const torrentHistory = [];

// Jackett configuration
const jackettApiKey = 'jackett_api_key'; // Replace with your Jackett API key
const jackettBaseUrl = 'http://jackett:9117'; // Replace with your Jackett server URL

app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(express.json()); // Parse JSON bodies

// Define routes
app.get('/', (req, res) => {
  res.render('index', { torrents: client.torrents, torrentHistory });
});

app.post('/download', (req, res) => {
  const magnetURI = req.body.magnetURI;

  if (magnetURI) {
    const torrent = client.add(magnetURI);

    torrent.on('done', () => {
      console.log('Torrent download finished');
      torrentHistory.push({ name: torrent.name, infoHash: torrent.infoHash });
    });

    res.send('Download started. Check the console for progress.');
  } else {
    res.status(400).send('Invalid magnet URI');
  }
});

app.get('/search', async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).send('Search query is required.');
  }

  try {
    const response = await axios.get(`${jackettBaseUrl}/api/v2.0/indexers/all/results?apikey=${jackettApiKey}&Query=${encodeURIComponent(query)}`);
    const searchResults = response.data.Results;

    res.render('search', { query, searchResults });
  } catch (error) {
    console.error('Error searching on Jackett:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/torrent/:id', (req, res) => {
  const torrentId = req.params.id;
  const torrent = client.get(torrentId);

  if (torrent) {
    res.render('torrent', { torrent });
  } else {
    res.status(404).send('Torrent not found');
  }
});

app.get('/stream/:id/:fileIndex', (req, res) => {
  const torrentId = req.params.id;
  const fileIndex = parseInt(req.params.fileIndex);
  const torrent = client.get(torrentId);

  if (torrent && torrent.files[fileIndex]) {
    const file = torrent.files[fileIndex];

    // Stream the file if it's a video, otherwise provide a download link
    if (file.name.match(/\.(mp4|mkv|avi)$/i)) {
      const range = req.headers.range;
      const positions = range.replace(/bytes=/, '').split('-');
      const start = parseInt(positions[0], 10);
      const end = positions[1] ? parseInt(positions[1], 10) : file.length - 1;
      const chunksize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4', // Update content type based on the file format
      });

      const stream = file.createReadStream({ start, end });
      stream.pipe(res);
    } else {
      res.download(file.path, file.name);
    }
  } else {
    res.status(404).send('File not found');
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
