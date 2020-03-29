const similarity = require('compute-cosine-similarity');
const moment = require('moment');

const User = require('../models/User');

module.exports = {
  getProfiles: async (req, res, next) => {
    const curr = await req.user;
    const sexuality = curr.sexuality;
    const gender = curr.gender;
    let filters = {
      _id: {$ne: curr.id},
      gender: {$in: sexuality},
      sexuality: {$in: gender}
    };
    if (req.body.location != null) {
      filters.location = req.body.location;
    }
    User.find(filters).select('-password -refresh_token -access_token').exec((err, users) => {
      if (!users) { 
        return res.json({message: 'No Users Found'});
      }
      similarityGenerator(req.user, users).then((result) => {
        sortPromise(result).then((sortedUsers) => {
          return res.json(sortedUsers);
        });
      });
    });
  },  
    getProfile: (req, res, next) => {
      const uId = req.params.id;
      const currUser = req.user;
      // Find user based on this id and serve it
      User.findOne({_id: uId}).select('-password').exec(async (err, user) => {
        if (err) {
          return res.json({error: err});
        }
        if (!user) {
          return res.status(404).json({message: 'User does not exist'});
        }
        Promise.all([generateAge(user.dob), generateSexuality(user.sexuality), similarityGenerator(currUser, user)]).then(values => {
          res.json({
            _id: user._id,
            user_name: user.user_name,
            fname: user.fname,
            sname: user.sname,
            age: values[0],
            sexuality: values[1],
            gender: user.gender,
            location: user.location,
            bio: user.bio,
            artists: user.artists || [],
            playlist: user.playlist || '',
            playlists: user.playlists || [],
            favouriteSong: user.favouriteSong || '',
            image: user.image,
            score: Math.round(values[2] * 100)
          });
        })
      })
    },
    updateProfile: async (req, res, next) => {
      // Find user and update by id
      const id = req.user._id;
      if (req.user_name !== req.body.user_name) {
        User.findOne({user_name: req.body.user_name}).exec((err, user) => {
          if (err) {
            return res.json({error: err});
          }
          if (user) {
            return res.status(403).json({message: 'Username already in use'});
          }
        });
      }
      let sexuality = [];
      if (req.body.sexuality == 'Everyone') {
        sexuality = ['Male', 'Female', 'Rather Not Say', 'Other'];
      } else {
        sexuality = [req.body.sexuality];
      }
      User.findOneAndUpdate({_id: id}, {$set: {
        user_name: req.body.user_name,
        fname: req.body.fname,
        sname: req.body.sname,
        dob: req.body.dob,
        location: req.body.location,
        image: req.body.image,
        gender: req.body.gender,
        sexuality: sexuality,
        bio: req.body.bio,
        complete: true}}).exec((err, user) => {
        if (err) {
          return res.json({error: err});
        }
        if (!user) {
          return res.status(404).json({message: 'User does not exist'});
        } else {
          return res.status(200).json({message: 'Successfully Updated!'});
        }
      });
    }
  };


  function artistSimilarity() {
    return new Promise((resolve, reject) => {

    });
  }
 
  function generateSexuality(sexuality) {
    return new Promise((resolve, reject) => {
      if (sexuality.length === 4) {
        resolve('Everyone');
      }
      else if (sexuality[0] == ['Male']) {
        resolve('Men');
      }
      else if (sexuality[0] == ['Female']) {
        resolve('Women');
      } else {
        reject({message: 'Error Generating Sexuality'});
      }
    });
  }

  function similarityGenerator(currUser, users) {
    let userArray = [];
    return new Promise(function (resolve, reject) {
      if (users.length > 1) {
        users.forEach((user) => {
          compareGenres(currUser, user).then(result => {
            userArray.push({
              _id: user._id,
              fname: user.fname,
              sname: user.sname,
              location: user.location,
              bio: user.bio,
              image: user.image,
              score: result});
          }).catch((error) => {
            userArray.push({
              _id: user._id,
              fname: user.fname,
              sname: user.sname,
              location: user.location,
              bio: user.bio,
              image: user.image,
              score: 0});
          });
          resolve(userArray);
        });
      } else {
        compareGenres(currUser, users).then(result => {
          resolve(result);
        }).catch((error) => {
          resolve(0);
        });
      }
    })
  }
  
  function sortPromise(users) {
    return new Promise(function (resolve, reject) {
      const result = users.sort((a, b) => (a.score >= b.score) ? -1 : 1);
      resolve(result);
    })
  }

  function generateAge(dob) {
    const age = new Promise(function (resolve, reject) {  
      if (dob === null) {
        reject({message: 'No DOB'});
      }
      const diff_ms = Date.now() - dob.getTime();
      const age_dt = new Date(diff_ms); 
      resolve(Math.abs(age_dt.getUTCFullYear() - 1970));
    });
    return age;
  }
  
  function compareGenres(usr1, usr2) {
    return new Promise(function (resolve, reject) {
      let keys = [];
      let usr1Score = [];
      let usr2Score = [];
      if (usr1.genres == null || usr2.genres == null) {
        reject({message: "Genres Is Undefined"});
      }
      usr1.genres.forEach((value, key, map) => {
        keys.push(key);
      });
      usr2.genres.forEach((value, key, map) => {
        if (!keys.includes(key)) {
          keys.push(key);
        }
      });
      keys.forEach((key) => {
        if (usr1.genres.has(key)) {
          usr1Score.push(usr1.genres.get(key));
        } else {
          usr1Score.push(0);
        }
        if (usr2.genres.has(key)) {
          usr2Score.push(usr2.genres.get(key));
        } else {
          usr2Score.push(0);
        }
      });
      const score = similarity(usr1Score, usr2Score);
      resolve(score);
    });
  }