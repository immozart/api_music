const mongoose = require("mongoose");

const artistSchema = new mongoose.Schema({
  email: {type: String, required: true},
  artist: {type: String, required: true},
  artistId: {type: String, required: true},
  albums: Array
});

module.exports = mongoose.model('artist', artistSchema);