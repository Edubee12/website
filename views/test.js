require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const _ = require("lodash");
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const { nextTick } = require("process");
const slugify = require('slugify');

const app = express();

app.set('view engine', 'ejs');

app.use(express.static("public"));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb+srv://Edubee12:uTau8mOP5e1HhMaO@cluster0.xbb7u.mongodb.net/CoachingBlogDB", {
  useNewUrlParser: true
});
mongoose.set('strictQuery', false);


const postSchema = {
  title: String,
  content: String,
  categories: [String],
  slug: {
    type: String,
    required: true,
    unique: true
  },
};

const Post = mongoose.model("Post", postSchema);

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  username: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
userSchema.index({ username: 1 }, { unique: false });

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    cb(null, { id: user.id, username: user.username, name: user.name });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

passport.use(
new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
       callbackURL: "http://localhost:3000/auth/google/secrets",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({ 'googleId': profile.id })
      .then(user => {
          if (!user) {
              let username = '';
              if (profile.emails && profile.emails.length > 0) {
                username = profile.emails[0].value;
              }
              if (username !== '') { // check if username is not empty
                user = new User({
                  googleId: profile.id,
                  username: username
                });
                user.save()
                  .then(() => done(null, user))
                  .catch(err => done(err));
              } else {
                done(null, false, { message: 'Username is required.' });
              }
          } else {
              done(null, user);
          }
      })
      .catch(err => done(err));
    }
));


const d = new Date();
const year = d.getFullYear();



app.get("/", function(req, res) {
  res.render("index", {
    year: year
  })
});
app.get("/auth/google",
  passport.authenticate('google', {
    scope: ["profile"]
  })
);

app.get("/auth/google/secrets",
  passport.authenticate('google', {
    failureRedirect: "/login"
  }),
  function(req, res) {
    // Successful authentication, redirect to secrets.
    res.redirect("/secrets");
  });

app.get("/login", function(req, res) {
  res.render("login", {
    year: year
  });
});

app.get("/register", function(req, res) {
  res.render("register", {
    year: year
  });
});

app.get("/secrets", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("secrets", {
      year: year
    });
  } else {
    res.redirect("/login");
  }

});

app.get("/submit", function(req, res) {
  if (req.isAuthenticated()) {
    res.render("submit", {
      year: year
    });
  } else {
    res.redirect("/login");
  }
});

app.post("/submit", function(req, res) {
  const submittedSecret = req.body.secret;

  //Once the user is authenticated and their session gets saved, their user details are saved to req.user.
  // console.log(req.user.id);

  User.findById(req.user.id, function(err, foundUser) {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.secret = submittedSecret;
        foundUser.save(function() {
          res.redirect("/secrets");
        });
      }
    }
  });
});

app.get('/logout', function(req, res) {
  req.logout(function(err) {
    if (err) {
      console.log(err);
      return nextTick(err);
    }
    res.redirect('/');
  });
});



app.get('/blog', async (req, res) => {
  const currentPage = parseInt(req.query.page) || 1;
  const perPage = 12;
  try {
    const posts = await Post.find({})
      .skip((currentPage - 1) * perPage)
      .limit(perPage)
      .sort({
        _id: -1
      })
      .exec();
    const count = await Post.countDocuments();
    res.render('blog', {
      posts,
      year: year,
      current: currentPage,
      pages: Math.ceil(count / perPage)
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});



app.get("/thankyoupage", function(req, res) {
  res.render("thankyoupage", {
    year: year
  })
});


app.get("/FreeMasterClass", function(req, res) {
  res.render("FreeMasterClass", {
    year: year
  })
});



app.get("/secrets/compose", async function(req, res) {
  const post = await Post.findById(req.params.id)
  res.render("compose", {
    post: {
      categories: []
    },
    year: year
  })
});

app.get('/edit/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    res.render('edit', {
      post: post,
      title: post.title,
      content: post.content,
      categories: post.categories.join(', '),
      year: year
    })
  } catch (err) {
    console.error(err)
    res.redirect('/')
  }
})

app.post('/edit/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    post.title = req.body.title
    post.content = req.body.content
    post.categories = req.body.categories.split(',').map(category => category.trim())
    await post.save()
    res.redirect(`/posts/${req.params.id}`)
  } catch (err) {
    console.error(err)
    res.redirect('/')
  }
})


app.post("/compose", async function(req, res) {
  const post = new Post({
    title: req.body.postTitle,
    content: req.body.postBody,
    categories: req.body.categories.split(',').map((category) => category.trim()).concat(),
    slug: slugify(req.body.postTitle, {
      lower: true
    })
  });

  try {
    const newPost = await post.save();
    res.redirect(`/posts/${newPost.slug}`); // redirect to the new post's slug page
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

app.get("/posts/:slug", async function(req, res) {
  const requestedPostSlug = req.params.slug;
  const post = await Post.findOne({
    slug: requestedPostSlug
  });
  if (!post) {
    res.redirect("/404");
    return;
  }
  Post.find({
      slug: {
        $lt: post.slug
      }
    })
    .sort({
      slug: -1
    })
    .limit(1)
    .exec((err, previousPost) => {
      Post.find({
          slug: {
            $gt: post.slug
          }
        })
        .sort({
          slug: 1
        })
        .limit(1)
        .exec((err, nextPost) => {
          res.render("post", {
            post: post,
            title: post.title,
            content: post.content,
            year: year,
            previousPost: previousPost[0],
            nextPost: nextPost[0]
          });
        });
    });
});




app.get('/search', paginatedResults(Post), async (req, res) => {
  const query = req.query.q;
  const category = req.query.category; // get category from query parameter
  const regex = new RegExp(_.escapeRegExp(query), 'i');
  const {
    results,
    previous,
    next
  } = res.paginatedResults;
  const currentPage = parseInt(req.query.page) || 1;
  const perPage = 12;
  const filteredResults = results.filter(post => regex.test(post.title) || regex.test(post.content));
  const count = await Post.countDocuments();
  filteredResults.sort((a, b) => {
    if (a.id < b.id) return 1;
    if (a.id > b.id) return -1;
    return 0;
  });

  let header = '';
  if (category) {
    header = `Posts in ${category}`; // set header for category
  } else if (query) {
    header = `Search results for "${query}"`; // set header for search query
  } else {
    header = 'All Posts'; // default header
  }

  res.render('search', {
    posts: filteredResults,
    previous,
    next,
    query,
    category,
    year: year,
    current: currentPage,
    pages: Math.ceil(count / perPage),
    header, // pass the header to the template
    categories: [], // initialize categories as empty array
  });
});

app.post("/register", function(req, res) {

  User.register({
    username: req.body.username
  }, req.body.password, function(err, user) {
    if (err) {
      console.log(err);
      res.redirect("/register");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });

});

app.post("/login", function(req, res) {

  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err) {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate("local")(req, res, function() {
        res.redirect("/secrets");
      });
    }
  });

});



function paginatedResults(model) {
  return async (req, res, next) => {
    const page = parseInt(req.query.page)
    const limit = parseInt(req.query.limit)
    const category = req.query.category

    const startIndex = (page - 1) * limit
    const endIndex = page * limit

    const results = {}

    if (endIndex < await model.countDocuments().exec()) {
      results.next = {
        page: page + 1,
        limit: limit,
        category: category
      }
    }

    if (startIndex > 0) {
      results.previous = {
        page: page - 1,
        limit: limit,
        category: category
      }
    }
    try {
      let query = {}
      if (category) {
        query = {
          categories: category
        }
      }
      results.results = await model.find(query).limit(limit).skip(startIndex).exec()
      res.paginatedResults = results
      next()
    } catch (e) {
      res.status(500).json({
        message: e.message
      })
    }
  }
};

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/')
}

app.get('/admin', ensureAuthenticated, function(req, res) {
  res.render('admin');
});



let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000
}
app.listen(port, () => {
  console.log("Server started on port 3000")
})
