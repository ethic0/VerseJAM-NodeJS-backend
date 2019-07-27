var router = require('express').Router();
var mongoose = require('mongoose');
var Poem = mongoose.model('Poem');
var Comment = mongoose.model('Comment');
var User = mongoose.model('User');
var auth = require('../auth');

// Preload poem objects on routes with ':poem'
router.param('poem', function(req, res, next, slug) {
  Poem.findOne({ slug: slug})
    .populate('author')
    .then(function (poem) {
      if (!poem) { return res.sendStatus(404); }

      req.poem = poem;
``
      return next();
    }).catch(next);
});

router.param('comment', function(req, res, next, id) {
  Comment.findById(id).then(function(comment){
    if(!comment) { return res.sendStatus(404); }

    req.comment = comment;

    return next();
  }).catch(next);
});

router.get('/', auth.optional, function(req, res, next) {
  var query = {};
  var limit = 20;
  var offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  if( typeof req.query.tag !== 'undefined' ){
    query.tagList = {"$in" : [req.query.tag]};
  }

  Promise.all([
    req.query.author ? User.findOne({username: req.query.author}) : null,
    req.query.favorited ? User.findOne({username: req.query.favorited}) : null
  ]).then(function(results){
    var author = results[0];
    var favoriter = results[1];

    if(author){
      query.author = author._id;
    }

    if(favoriter){
      query._id = {$in: favoriter.favorites};
    } else if(req.query.favorited){
      query._id = {$in: []};
    }

    return Promise.all([
      Poem.find(query)
        .limit(Number(limit))
        .skip(Number(offset))
        .sort({createdAt: 'desc'})
        .populate('author')
        .exec(),
      Poem.count(query).exec(),
      req.pyload ? User.findById(req.payload.id) : null,
    ]).then(function(results){
      var poems = results[0];
      var poemsCount = results[1];
      var user = results[2];

      return res.json({
        poems: poems.map(function(poem){
          return poem.toJSONFor(user);
        }),
        poemsCount: poemsCount
      });
    });
  }).catch(next);
});

router.get('/feed', auth.required, function(req, res, next) {
  var limit = 20;
  var offset = 0;

  if(typeof req.query.limit !== 'undefined'){
    limit = req.query.limit;
  }

  if(typeof req.query.offset !== 'undefined'){
    offset = req.query.offset;
  }

  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    Promise.all([
      Poem.find({ author: {$in: user.following}})
        .limit(Number(limit))
        .skip(Number(offset))
        .populate('author')
        .exec(),
      Poem.count({ author: {$in: user.following}})
    ]).then(function(results){
      var poems = results[0];
      var poemsCount = results[1];

      return res.json({
        poems: poems.map(function(poem){
          return poem.toJSONFor(user);
        }),
        poemsCount: poemsCount
      });
    }).catch(next);
  });
});

router.post('/', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    var poem = new Poem(req.body.poem);

    poem.author = user;

    return poem.save().then(function(){
      console.log(poem.author);
      return res.json({poem: poem.toJSONFor(user)});
    });
  }).catch(next);
});

// return a poem
router.get('/:poem', auth.optional, function(req, res, next) {
  Promise.all([
    req.payload ? User.findById(req.payload.id) : null,
    req.poem.populate('author').execPopulate()
  ]).then(function(results){
    var user = results[0];

    return res.json({poem: req.poem.toJSONFor(user)});
  }).catch(next);
});

// update poem
router.put('/:poem', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if(req.poem.author._id.toString() === req.payload.id.toString()){
      if(typeof req.body.poem.title !== 'undefined'){
        req.poem.title = req.body.poem.title;
      }

      if(typeof req.body.poem.description !== 'undefined'){
        req.poem.description = req.body.poem.description;
      }

      if(typeof req.body.poem.body !== 'undefined'){
        req.poem.body = req.body.poem.body;
      }

      if(typeof req.body.poem.tagList !== 'undefined'){
        req.poem.tagList = req.body.poem.tagList
      }

      req.poem.save().then(function(poem){
        return res.json({poem: poem.toJSONFor(user)});
      }).catch(next);
    } else {
      return res.sendStatus(403);
    }
  });
});

// delete poem
router.delete('/:poem', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    if(req.poem.author._id.toString() === req.payload.id.toString()){
      return req.poem.deleteOne().then(function(){
        return res.sendStatus(204);
      });
    } else {
      return res.sendStatus(403);
    }
  }).catch(next);
});

// Favorite an poem
router.post('/:poem/favorite', auth.required, function(req, res, next) {
  var poemId = req.poem._id;

  User.findById(req.payload.id).then(function(user){
    if (!user) { return res.sendStatus(401); }

    return user.favorite(poemId).then(function(){
      return req.poem.updateFavoriteCount().then(function(poem){
        return res.json({poem: poem.toJSONFor(user)});
      });
    });
  }).catch(next);
});

// Unfavorite an poem
router.delete('/:poem/favorite', auth.required, function(req, res, next) {
  var poemId = req.poem._id;

  User.findById(req.payload.id).then(function (user){
    if (!user) { return res.sendStatus(401); }

    return user.unfavorite(poemId).then(function(){
      return req.poem.updateFavoriteCount().then(function(poem){
        return res.json({poem: poem.toJSONFor(user)});
      });
    });
  }).catch(next);
});

// return an poem's comments
router.get('/:poem/comments', auth.optional, function(req, res, next){
  Promise.resolve(req.payload ? User.findById(req.payload.id) : null).then(function(user){
    return req.poem.populate({
      path: 'comments',
      populate: {
        path: 'author'
      },
      options: {
        sort: {
          createdAt: 'desc'
        }
      }
    }).execPopulate().then(function(poem) {
      return res.json({comments: req.poem.comments.map(function(comment){
        return comment.toJSONFor(user);
      })});
    });
  }).catch(next);
});

// create a new comment
router.post('/:poem/comments', auth.required, function(req, res, next) {
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    var comment = new Comment(req.body.comment);
    comment.poem = req.poem;
    comment.author = user;

    return comment.save().then(function(){
      req.poem.comments.push(comment);

      return req.poem.save().then(function(poem) {
        res.json({comment: comment.toJSONFor(user)});
      });
    });
  }).catch(next);
});

router.delete('/:poem/comments/:comment', auth.required, function(req, res, next) {
  if(req.comment.author.toString() === req.payload.id.toString()){
    req.poem.comments.remove(req.comment._id);
    req.poem.save()
      .then(Comment.find({_id: req.comment._id}).deleteOne().exec())
      .then(function(){
        res.sendStatus(204);
      });
  } else {
    res.sendStatus(403);
  }
});

module.exports = router;
