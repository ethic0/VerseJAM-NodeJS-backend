var router = require('express').Router();
var mongoose = require('mongoose');
var Poem = mongoose.model('Poem');

// return a list of tags
router.get('/', function(req, res, next) {
  Poem.find().distinct('tagList').then(function(tags){
    return res.json({tags: tags});
  }).catch(next);
});

module.exports = router;
