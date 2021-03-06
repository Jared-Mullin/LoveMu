const Buffer = require('safer-buffer').Buffer;
const request = require('request');
const querystring = require('querystring');

const User = require('../models/User');

const clientId = process.env.clientID;
const secretId = process.env.secretID;
const redirectUri = 'https://lovemu.compsoc.ie/spotify/reqCallback';
const scope = 'user-top-read playlist-read-private';

/* We need to save the access and refresh tokens to each user
  - The access token is used to make calls to the Spotify API and
  retrieve the user's data
  - The refresh token is used in the event of an access token expiring,
  the token will be included in the request body (refreshToken route)
  the new access token must be saved to User */

module.exports = {
  requestAccess: (req, res, next) => {
    return res.redirect(`https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}`);
  },

  callbackAccess: (req, res, next) => {
    const code = req.query.code || null;

    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      headers: {
        'Authorization': 'Basic ' + ((Buffer.from(clientId + ':' + secretId)).toString('base64')),
      },
      json: true,
    };

    request.post(authOptions, (err, response, body) => {
      if (!err && response.statusCode === 200) {
        const refresh_token = body.refresh_token;
        res.redirect('https://lovemu.compsoc.ie/?' + querystring.stringify({
          spotify_token: refresh_token
        }));
      } else {
        return res.status(500).json({message: 'Error in Request'});
      }
    });
  },

  storeToken: (req, res, next) => {
    if (req.body.refresh_token == null) {
      return res.status(403).json({
        error: "access_token or refresh_token not provided"
      });
    }
    console.log(req.body.refresh_token);
    User.findOneAndUpdate({
      _id: req.user._id
    }, {
      $set: {
        refresh_token: req.body.refresh_token
      }
    }).exec((error, user) => {
      if (error) {
        return res.status(500).json({
          error: err
        });
      }
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      return res.status(200).json({
        message: 'Successfully Updated Tokens'
      });
    });
  },

  refreshAccess: (req, res, next) => {
    const refreshToken = req.user.refresh_token; // use this to find User's refresh token
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'Authorization': 'Basic ' + ((Buffer.from(clientId + ':' + secretId)).toString('base64')),
      },
      form: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      },
      json: true,
    };
    request.post(authOptions, (error, response, body) => {
      if (!error) {
        User.findOneAndUpdate({
          _id: req.user._id
        }, {
          $set: {
            access_token: body.access_token
          }
        }).exec((err, user) => {
          if (err) {
            res.status(500).json({
              error: err
            });
          }
          res.status(200).json({
            message: "Successful Refresh!"
          });
        });
      }
    });
  },

  retrieveDetails: (req, res, next) => {
    User.findOne({
      _id: req.user._id
    }).exec(async (err, user) => {
      if (err) {
        return res.json({
          error: err
        });
      }
      if (!user) {
        return res.json({
          message: 'User not found'
        });
      }
      const authOptionsArtists = {
        method: "get",
        url: `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=long_term`,
        headers: {
          'Authorization': `Bearer ${user.access_token}`
        },
        json: true,
      };

      const authOptionsGenres = {
        method: "get",
        url: `https://api.spotify.com/v1/me/top/artists?limit=50&time_range=long_term`,
        headers: {
          'Authorization': `Bearer ${user.access_token}`
        },
        json: true,
      };

      const authOptionsPlaylists = {
        method: "get",
        url: `https://api.spotify.com/v1/me/playlists?limit=50`,
        headers: {
          'Authorization': `Bearer ${user.access_token}`
        },
        json: true,
      };

      Promise.all([mapArtists(authOptionsArtists, user.blockedArtists), mapGenres(authOptionsGenres), retrievePlaylists(authOptionsPlaylists)]).then((values) => {
        User.updateOne({
          _id: user._id
        }, {
          $set: {
            artists: new Map([...values[0], ...user.artists]),
            genres: new Map([...values[1], ...user.genres]),
            playlists: values[2]
          }
        }).exec((err, user) => {
          if (err) {
            console.log(err);
            return res.status(500).json(err);
          }
          return res.status(200).json({
            message: 'Successfully Retrieved Details'
          });
        });
      }).catch((err) => {
        console.log(err);
        res.status(500).json({error: err});
      });
    });
  },

  search: (req, res, next) => {
    const query = req.body.query;
    const type = req.body.type;
    const params = querystring.stringify({
      q: query,
      type: type
    });
    console.log(params);
    const authOptions = {
      method: "get",
      url: `https://api.spotify.com/v1/search/?${params}`,
      headers: {
        'Authorization': `Bearer ${req.user.access_token}`
      },
      json: true,
    };
    searchSpotify(query, type, authOptions).then((results) => {
      res.status(200).json(results);
    }).catch((err) => {
      console.log(err);
      res.status(500).json({
        error: err
      });
    });
  }
}

// Promise to return hash map of Genres
function mapGenres(authOptions) {
  return new Promise((resolve, reject) => {
    const genreMap = new Map();
    request(authOptions, async (err, response, body) => {
      if (err) {
        reject(err);
      }
      if (response.statusCode !== 200) {
        reject('Unauthorized Request');
      }
      const items = await body.items;
      if (items != null) {
        items.forEach((item, index) => {
          const genres = item.genres;
          genres.forEach((genre, index) => {
            if (!genreMap.has(genre)) {
              genreMap.set(genre, 0);
            }
            genreMap.set(genre, genreMap.get(genre) + 1);
          });
        });
      }
      resolve(genreMap);
    });
  });
}

function mapArtists(authOptions, blocked) {
  return new Promise((resolve, reject) => {
    request(authOptions, (err, response, body) => {
      if (err) {
        reject(err);
      }
      if (response.statusCode !== 200) {
        reject('Unauthorized Request');
      }
      const items = body.items;
      if (items != null) {
        const artistMap = new Map(
          items
          .filter(i => !blocked.has(i.id.toString()))
          .map(i => [i.id.toString(), i])
        );
        resolve(artistMap);
      } else {
        resolve(new Map());
      }
    })
  });
}

function retrievePlaylists(authOptions) {
  return new Promise((resolve, reject) => {
    request(authOptions, async (err, response, body) => {
      if (err) {
        reject(err);
      }
      if (response.statusCode !== 200) {
        reject('Unauthorized Request');
      }
      const playlists = body.items;
      if (playlists != null) {
        resolve(playlists);
      } else {
        resolve([]);
      }
    });
  });
}

function searchSpotify(query, type, authOptions) {
  return new Promise((resolve, reject) => {
    request.get(authOptions, (err, res, body) => {
      if (err) {
        reject(err);
      }
      if (res.statusCode !== 200) {
        reject('Unauthorized Request')
      }
      if (type == 'track') {
        resolve(body.tracks);
      }
      if (type == 'artist') {
        resolve(body.artists);
      }
    });
  });
}