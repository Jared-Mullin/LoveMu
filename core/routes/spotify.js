const express = require('express');
const router = express.Router();

const Spotify = require('../controllers/spotifyController');

router.get('/reqAccess', Spotify.requestAccess);

router.get('/reqCallback', Spotify.callbackAccess);

router.post('/refToken', Spotify.refreshAccess);

router.post('/retrieveDetails', Spotify.retrieveDetails);

module.exports = router;
