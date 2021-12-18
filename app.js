//jshint esversion:6
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const lodash = require("lodash");
const port = process.env.PORT || 3000;
const cl = console.log;
const session = require("express-session");
const MongoStore = require("connect-mongo")(session);
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { ensureAuth, ensureGuest } = require("./middleware/auth");
const { defaultsDeep } = require("lodash");
const app = express();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
  .then((conn) =>
    cl("Mongo DB  connected successfully " + conn.connection.host)
  )
  .catch((e) => cl("Erroor Connecting"));

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
  },
});
const User = mongoose.model("User", userSchema);

const itemsSchema = new mongoose.Schema({
  name: String,
  // listName: String,
});

const Item = mongoose.model("Item", itemsSchema);

const item1 = new Item({
  name: "Welcome to your todolist!",
});

const item2 = new Item({
  name: "Hit the + button to add a new item.",
});

const item3 = new Item({
  name: "<-- Hit this to delete an item.",
});

const defaultItems = [item1, item2, item3];

const listSchema = mongoose.Schema(
  {
    name: String,
    items: [itemsSchema],
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const List = mongoose.model("List", listSchema);

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL:
        "https://https://todolist-nodejs-mongoose.herokuapp.com/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const newUser = {
        googleId: profile.id,
      };
      try {
        const user = await User.findOne({
          googleId: profile.id,
        });
        if (user) {
          done(null, user);
        } else {
          const nuser = await User.create(newUser);
          done(null, nuser);
        }
      } catch (e) {
        console.error(e);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => done(err, user));
});

app.use(
  session({
    secret: "samirmorey",
    resave: false,
    saveUninitialized: false,
    maxAge: 24 * 60 * 60 * 1000 * 10,
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
    unset: "destroy",
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.get("/", ensureGuest, function (req, res) {
  res.render("login");
});
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/list" }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect("/list");
  }
);

app.get("/list", ensureAuth, async function (req, res) {
  const mylist = await List.find({
    name: "list",
    user: req.user.id,
  }).lean();
  if (mylist.length !== 0 && mylist[0].items.length !== 0) {
    res.render("list", {
      listTitle: mylist[0].name,
      newListItems: mylist[0].items,
      linktobeserved: "/about",
      linkName: "About Me",
    });
  } else {
    res.render("list", {
      listTitle: "list",
      newListItems: defaultItems,
      linktobeserved: "/about",
      linkName: "About Me",
    });
  }
  // Item.find({}, function (err, foundItems) {
  //   if (foundItems.length === 0) {
  //     Item.insertMany(defaultItems, function (err) {
  //       if (err) {
  //         console.log(err);
  //       } else {
  //         console.log("Successfully savevd default items to DB.");
  //       }
  //     });
  //     res.redirect("/");
  //   } else {
  //     res.render("list", {
  //       listTitle: "list",
  //       newListItems: foundItems,
  //       linktobeserved: "/about",
  //       linkName: "About Me",
  //     });
  //   }
  // });
});

app.get("/about", ensureAuth, (req, res) => {
  res.render("about", {
    listTitle: "About",
    linktobeserved: "/",
    linkName: "Back To Home",
  });
});

app.get("/logout", (req, res) => {
  req.session = null;
  res.redirect("/");
});

app.get("/:customListName", ensureAuth, async function (req, res) {
  const customListName = req.params.customListName;
  const mylist = await List.find({
    name: customListName,
    user: req.user.id,
  }).lean();
  if (mylist.length !== 0 && mylist[0].items.length !== 0) {
    res.render("list", {
      listTitle: mylist[0].name,
      newListItems: mylist[0].items,
      linktobeserved: "/about",
      linkName: "About Me",
    });
  } else {
    res.render("list", {
      listTitle: customListName,
      newListItems: [],
      linktobeserved: "/about",
      linkName: "About Me",
    });
  }
});

app.post("/", ensureAuth, async function (req, res) {
  const itemName = req.body.newItem;
  const listName = req.body.list;

  const item = new Item({
    name: itemName,
    // listName: listName,
  });

  List.findOne(
    { name: listName, user: req.user.id },
    function (err, foundList) {
      if (foundList) {
        foundList.items.push(item);
        foundList.save();
      } else {
        const newlist = new List({
          name: listName,
          items: [item],
          user: req.user.id,
        });
        newlist.save();
      }

      res.redirect("/" + listName);
    }
  );
});

app.post("/delete", ensureAuth, function (req, res) {
  const checkedItemId = req.body.checkbox;
  const listName = req.body.listName;
  console.log(checkedItemId, listName);
  List.findOneAndUpdate(
    { name: listName, user: req.user.id },
    { $pull: { items: { _id: checkedItemId } } },
    function (err, foundList) {
      res.redirect("/" + listName);
    }
  );
});

app.listen(port, function () {
  console.log("Server started on port " + port);
});
