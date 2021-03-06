const express = require('express');
const router = express.Router();
const authModel = require("../models/auth");
const artistModel = require("../models/artists");
const fetch = require("node-fetch");
const Url = require("../controller/url");
const getIdUrl = Url.getIdUrl, getArtistUrl = Url.getArtistUrl;
const toCapitalize = require("../controller/methods");
const bcrypt = require('bcrypt');
const saltRounds = 10;
const checkAll = require("../controller/checker");

router.get('/', async (req, res, next) => {
  if (req.session.user) {
    res.render('index', {userName: req.session.user.firstName});
  } else {
    res.render('index');
  }
});

router.post('/', async (req, res) => {
  const userName = req.session.user ? req.session.user.firstName : '';
  let artist = toCapitalize(req.body.artist);
  const idUrl = getIdUrl(artist);
  const regex = new RegExp(`^${artist.toLowerCase()}$`);
  const idResult = await fetch(idUrl);
  const idJson = await idResult.json();

  let artists = idJson.results.filter((item) =>
    (item.title.toLowerCase() === artist.toLowerCase()
      || item.title.toLowerCase().match(regex)) && item.type === 'artist'
  );
  artists = artists.map((item) => {
    return {title: item['title'], id: item['id']}
  });

  if (artists.length === 0) {
    res.render('index', {message: 'Ничего не найдено!', userName})
  } else if (artists.length === 1) {
    const artistId = artists[0].id;

    const artistUrl = getArtistUrl(artistId, 1);
    const albumsResult = await fetch(artistUrl);
    const albumsJson = await albumsResult.json();
    const pagesNumber = albumsJson.pagination["pages"];
    let finalAlbums = albumsJson.releases.filter((item) => item.artist.toLowerCase() === artist.toLowerCase()
      && item.type === 'master');
    finalAlbums = finalAlbums.map((item) => {
      return {title: item.title, year: item.year}
    });
    if (pagesNumber > 1) {
      for (let page = 2; page <= pagesNumber; page++) {
        const artistUrl = getArtistUrl(artistId, page);
        const albumsResult = await fetch(artistUrl);
        const albumsJson = await albumsResult.json();
        let albums = albumsJson.releases.filter((item) => item.artist.toLowerCase() === artist.toLowerCase()
          && item.type === 'master');
        albums = albums.map((item) => {
          return {title: item.title, year: item.year}
        });
        if (albums.length === 0) {
          break
        }
        finalAlbums = finalAlbums.concat(albums);
      }
    }

    if (finalAlbums.length === 0) {
      res.render('index', {
        artists, albumMessage: 'Альбомы по этому исполнителю не найдены.', userName
      })

    } else {
      req.session.artist = {artist: artist, artistId: artistId, albums: finalAlbums};
      res.render('index', {artists, finalAlbums, userName})
    }
  } else {
    res.render('index', {artists, userName})
  }
});

router.get('/add', async (req, res) => {
  req.session.add = true;
  if (req.session.user) {
    res.redirect('/lk')
  } else {
    res.redirect('/login')
  }
});

router.get('/delete/:id', async (req, res) => {
  await artistModel.findOneAndDelete({
    email: req.session.user.email, artistId: req.params.id
  });
  res.redirect('/lk');
});

router.get('/lk', async (req, res) => {
  if (req.session.user) {
    if (req.session.add) {
      let count = await artistModel.find({email: req.session.user.email, artistId: req.session.artist.artistId});
      if (count.length === 0) {
        let newArtist = new artistModel({
          email: req.session.user.email,
          artist: req.session.artist.artist,
          artistId: req.session.artist.artistId,
          albums: req.session.artist.albums
        });
        await newArtist.save();
        req.session.add = undefined;
        const artists = await artistModel.find({email: req.session.user.email});
        res.render('lk', {artists, userName: req.session.user.firstName})
      } else {
        const artist = req.session.artist.artist;
        req.session.artist = undefined;
        req.session.add = undefined;
        const artists = await artistModel.find({email: req.session.user.email});
        res.render('lk', {
          artists, userName: req.session.user.firstName,
          duplicateError: `Исполнитель ${artist} уже добавлен в избранное.`
        });
      }
    } else {
      const artists = await artistModel.find({email: req.session.user.email});
      res.render('lk', {artists, userName: req.session.user.firstName})
    }
  } else {
    res.redirect('/login')
  }
});

router.post('/lk', async (req, res) => {
  if (req.session.user) {

    let artists = await artistModel.find({email: req.session.user.email});
    artists = artists.map(item => {
      return {artistId: item.artistId, artist: item.artist, albumsNumber: item.albums.length}
    });

    let checkMessages = [];

    for (let item of artists) {
      let artist = item.artist;
      let artistId = item.artistId;
      let albumsNumber = item.albumsNumber;

      const artistUrl = getArtistUrl(artistId, 1);
      const albumsResult = await fetch(artistUrl);
      const albumsJson = await albumsResult.json();
      const pagesNumber = albumsJson.pagination["pages"];
      let finalAlbums = albumsJson.releases.filter((item) => item.artist.toLowerCase() === artist.toLowerCase()
        && item.type === 'master');
      finalAlbums = finalAlbums.map((item) => {
        return {title: item.title, year: item.year}
      });
      if (pagesNumber > 1) {
        for (let page = 2; page <= pagesNumber; page++) {
          const artistUrl = getArtistUrl(artistId, page);
          const albumsResult = await fetch(artistUrl);
          const albumsJson = await albumsResult.json();
          let albums = albumsJson.releases.filter((item) => item.artist.toLowerCase() === artist.toLowerCase()
            && item.type === 'master');
          albums = albums.map((item) => {
            return {title: item.title, year: item.year}
          });
          if (albums.length === 0) {
            break
          }
          finalAlbums = finalAlbums.concat(albums);
        }
      }

      const lastAlbum = finalAlbums[albumsNumber - 1].title;

      if (finalAlbums.length > albumsNumber) {
        checkMessages.push(`У ${artist} вышел новый альбом - ${lastAlbum}!\n`)
      }
    }

    if (checkMessages.length === 0) {
      checkMessages = ['Новых альбомов нет!'];
    }

    res.render('lk', {artists, userName: req.session.user.firstName, checkMessages})
  } else {
    res.redirect('/')
  }

});

router.get('/logout', (req, res) => {
  if (req.session.user) {
    req.session.destroy();
  }
  res.redirect('/');
});

router.get('/login', async (req, res, next) => {
  if (req.session.user) {
    res.redirect('/lk')
  } else {
    res.render('login');
  }
});

router.get('/registration', (req, res, next) => {
  res.render('auth');
});

router.post('/login', async (req, res, next) => {
  const login = req.body.login, password = req.body.password;
  if (login === '' || password === '') {
    res.render('login', {errorMessage: 'Каждое поле должно быть заполнено.'})
  }
  let userInfo = await authModel.find({login});

  if (userInfo.length === 0) {
    res.render('login', {errorMessage: 'Такого пользователя в системе не существует.'});
  } else {
    bcrypt.compare(password, userInfo[0].password, (err, result) => {
      if (result === true) {
        req.session.user = userInfo[0];
        res.redirect('/lk');
      } else {
        res.render('login', {errorMessage: 'Вы ввели неправильный пароль.'});
      }
    });
  }
});

router.post('/registration', (req, res, next) => {
  bcrypt.hash(req.body.password, saltRounds, async (err, hash) => {
    let newUser = new authModel({
      login: req.body.login,
      email: req.body.email,
      firstName: req.body.firstname,
      lastName: req.body.lastname,
      password: hash
    });

    await newUser.save((error) => {
      if (error) {
        if (error.code === 11000) {
          res.render('auth',
            {errorMessage: "Пользователь с таким логином уже существует в системе."});
        }
        let errorMessages = [];
        const regWords = {
          'login': 'Логин', 'firstName': 'Имя', 'lastName': 'Фамилия',
          'email': 'E-Mail', 'password': 'Пароль'
        };
        if (error.errors) {
          for (let err in error.errors) {
            errorMessages.push(err);
          }
        }
        if (errorMessages.length === 1) {
          res.render('auth', {errorMessage: `Поле ${regWords[errorMessages[0]]} не может быть пустым.`});
        } else if (errorMessages.length > 1) {
          res.render('auth', {errorMessage: 'Каждое поле должно быть заполнено.'});
        }
      } else {
        req.session.user = newUser;
        res.redirect('/lk');
      }
    });
  });
});

router.get('/lk/:id', async (req, res) => {
  if (req.session.user) {
    const artists = await artistModel.find({artistId: req.params.id});
    res.render('artist', {artist: artists[0].artist, albums: artists[0].albums, userName: req.session.user.firstName})
  } else {
    res.redirect('/')
  }
});

module.exports = router;
