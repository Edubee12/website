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
const {
  nextTick
} = require("process");
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

mongoose.connect(process.env.MONGODB_URI, {
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
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
userSchema.index({
  username: 1
}, {
  unique: false
});

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    cb(null, {
      id: user.id,
      username: user.username,
      name: user.name
    });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});

passport.use(
  new GoogleStrategy({
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "https://www.biiedwin.com/auth/google/compose"
      ,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function(accessToken, refreshToken, profile, done) {
      User.findOne({
          'googleId': profile.id
        })
        .then(user => {
          if (!user) {
            user = new User({
              googleId: profile.id,
            });
            user.save()
              .then(() => done(null, user))
              .catch(err => done(err));
          } else {
            done(null, user);
          }
        })
        .catch(err => done(err));
    }


  )
);

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

app.get("/auth/google/compose",
  passport.authenticate('google', {
    failureRedirect: "/login"
  }),
  function(req, res) {
    // Successful authentication, redirect to compose.
    res.redirect("/compose");
  });

app.get("/login", function(req, res) {
  res.render("login", {
    year: year
  });
});
app.get("/privacypolicy", function(req, res) {
  res.render("privacypolicy", {
    year: year
  });
});

app.get("/termsofuse", function(req, res) {
  res.render("termsofuse", {
    year: year
  });
});

app.get("/disclaimer", function(req, res) {
  res.render("disclaimer", {
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



app.get("/compose", async function(req, res) {
  const post = await Post.findById(req.params.id)

  if (req.isAuthenticated()) {
    res.render("compose", {
      post: {
        categories: []
      },
      year: year
    })
  } else {
    res.redirect("/login");
  }
});

app.get('/edit/:slug', async (req, res) => {
  try {
    const post = await Post.findOne({
      slug: req.params.slug
    });

    if (!post) {
      res.redirect('/404');
      return;
    }

    if (req.isAuthenticated()) {
      res.render('edit', {
        post: post,
        title: post.title,
        content: post.content,
        categories: post.categories.join(', '),
        year: year
      });
    } else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.redirect('/500');
  }
});


app.post('/edit/:slug', async (req, res) => {
  try {
    const post = await Post.findOne({
      slug: req.params.slug
    });
    post.title = req.body.title;
    post.content = req.body.content;
    post.categories = req.body.categories.split(',').map(category => category.trim());
    await post.save();
    res.redirect(`/posts/${post.slug}`);
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});



app.post("/compose", async function(req, res) {
  const title = req.body.postTitle;
  const content = req.body.postBody;
  const categories = req.body.postCategories;
  const slug = slugify(title, {
    lower: true,
    strict: true
  });

  const newPost = new Post({
    title: title,
    content: content,
    categories: categories ? categories.split(",").map((category) => category.trim()) : [],
    slug: slug,
  });

  try {
    await newPost.save();
    res.redirect("/blog");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});


app.get("/posts/:slug", async function(req, res) {
  const requestedPostSlug = req.params.slug;

  try {
    const post = await Post.findOne({
      slug: requestedPostSlug
    });
    if (!post) {
      res.redirect("/404");
      return;
    }
    const previousPost = await Post.findOne({
        _id: {
          $lt: post._id
        }
      })
      .sort({
        _id: -1
      })
      .limit(1);
    const nextPost = await Post.findOne({
        _id: {
          $gt: post._id
        }
      })
      .sort({
        _id: 1
      })
      .limit(1);
    res.render("post", {
      post: post,
      title: post.title,
      content: post.content,
      year: year,
      previousPost: previousPost,
      nextPost: nextPost
    });
  } catch (err) {
    console.error(err);
    res.redirect("/500");
  }
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
        res.redirect("/Compose");
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
        res.redirect("/compose");
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
