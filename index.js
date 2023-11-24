const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const Base64 = require("js-base64");
const bcrypt = require("bcrypt");
const bodyParser = require("body-parser");
const efp = require("express-fileupload");
const expressFavicon = require("express-favicon");
const path = require("path");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const http = require('http');
const winston = require("winston");
var morgan = require('morgan')
var rfs = require('rotating-file-stream');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require('nodemailer');
require("dotenv").config();

const app = express();
const port = 3000;

const logDirectory = path.join(__dirname, "logs");
// morgan.token('user-ip', (req) => req.ip);
const logFormat = ":date[web] :remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms - :referrer :user-agent - :req[header] :res[header]";
// :date[web] - :method :url :status - :remote-addr - :response-time ms
// :date[web] :remote-addr :remote-user :method :url HTTP/:http-version :status :res[content-length] - :response-time ms - :referrer :user-agent

fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

function getCurrentDate() {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const year = now.getFullYear();
  return `${day}-${month}-${year}`;
}

const accessLogStream = {
  write: (text) => {
    const filename = path.join(logDirectory, `${getCurrentDate()}.log`);
    fs.appendFile(filename, text, (err) => {
      if (err) {
        console.error("Error writing to log file:", err);
      }
    });
  },
};

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, "logs", `${getCurrentDate()}.log`),
    }),
  ],
});

var jsonParser = bodyParser.json();
var urlencodedParser = bodyParser.urlencoded({ extended: false });

const uri = process.env.MONGODB_URI;

let usersCollection;
let InvitesCollection;

const allowedOrigins = ['http://localhost:3000', 'https://9bv5rttd-3000.use.devtunnels.ms/home'];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Custom-Header'],
  credentials: true,
};

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));
app.use(expressFavicon(__dirname + "/public/favicon.ico"));
app.use(efp());
app.use(express.json());
app.use(cors(corsOptions));
app.options('*', cors())
app.use(helmet({ contentSecurityPolicy: false }));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan(logFormat, { stream: accessLogStream }));

app.set('trust proxy', 1);

const cdnDir = path.join(__dirname, "cdn");
app.use("/cdn", express.static(cdnDir));

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function ConectMongoDB() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB");
    logger.info("Connected to MongoDB");

    const db = client.db("CatboyLand");
    usersCollection = db.collection("Catboyland");
    PostCollection = db.collection("Catboyland-Posts");
    SinPostCollection = db.collection("Sinyvile-Posts");
    InvitesCollection = db.collection("Sin-Invites");
    BlogCollection = db.collection("Catboyland-Blog");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    logger.error("Error connecting to MongoDB:", error);
  }
}
ConectMongoDB().catch(console.dir);

function generateUniqueInviteCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const codeLength = 8;
  let inviteCode = '';

  for (let i = 0; i < codeLength; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    inviteCode += characters.charAt(randomIndex);
  }

  return inviteCode;
}

const userRateLimit = {
  limit: 5,
  windowMs: 60 * 1000,
  userMap: new Map(),
};

const globalRateLimit = {
  limit: 100,
  windowMs: 60 * 60 * 1000,
  count: 0,
};

function generateToken(id, username, hashedPassword) {
  const token = Base64.encode(`${id}${username}${hashedPassword}`);
  logger.info("New token generatated for user:", username,  ` (${id})`);
  return token;
}

function calculateAccuracy(searchTerm, username) {
  const commonChars = [...searchTerm].filter((char) =>
    username.includes(char)
  ).length;
  return commonChars;
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max requests per IP - 100
});
app.use(limiter);

function checkUserRateLimit(req, res, next) {
  const token = req.cookies.token;
  const user = userRateLimit.userMap.get(token) || {
    count: 0,
    lastCheck: Date.now(),
  };

  if (Date.now() - user.lastCheck > userRateLimit.windowMs) {
    user.count = 0;
  }

  if (user.count >= userRateLimit.limit) {
    return res
      .status(429)
      .json({ success: false, message: "User rate limit exceeded." });
  }

  user.count++;
  user.lastCheck = Date.now();
  userRateLimit.userMap.set(token, user);

  next();
}

function checkGlobalRateLimit(req, res, next) {
  if (globalRateLimit.count >= globalRateLimit.limit) {
    return res
      .status(429)
      .json({ success: false, message: "Global rate limit exceeded." });
  }

  globalRateLimit.count++;
  setTimeout(() => {
    globalRateLimit.count--;
  }, globalRateLimit.windowMs);

  next();
}

async function checkUserBanStatus(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return next();
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return next();
    }

    if (user.banned === true) {
      res.clearCookie("token");
      return res.redirect("/not-aproved");
    }

    next();
  } catch (error) {
    console.error("Error checking ban status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

app.set("view engine", "ejs");

app.get("/not-aproved", async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/");
    }

    if (user.banned === true) {
      const banReason = user.banReason || "No reason provided.";
      return res.render("banned", { banReason });
    }

    res.redirect("/");
  } catch (error) {
    console.error("Error checking ban status:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/retard", async (req, res) => {
  const directoryPath = path.join(__dirname, "/cdn/liam");

  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.log(err);
      return res.status(500).send("Error reading the directory");
    }

    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|bmp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
      return res.status(404).send("No images found in the directory");
    }

    const randomImage = imageFiles[Math.floor(Math.random() * imageFiles.length)];

    const imagePath = path.join(directoryPath, randomImage);

    res.sendFile(imagePath);
  });
});

app.get("/tos", async (req, res) => {
  const token = req.cookies.token;
  try {
  const user = await usersCollection.findOne({ token });
  res.render("tos", {user});
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
  }
});

app.get("/privacy", async (req, res) => {
  const token = req.cookies.token;
  try {
  const user = await usersCollection.findOne({ token });
  res.render("privacy", {user});
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
  }
});

app.get("/log-example", async (req, res) => {
  res.sendFile("./cdn/images/log-example.log");
});

app.get("/login", async (req, res) => {
  const token = req.cookies.token;

  if (token) {
    try {
      const user = await usersCollection.findOne({ token });

      if (user) {
        return res.redirect("/home");
      }
    } catch (error) {
      console.error("Error checking token in MongoDB:", error);
    }
  }

  res.render("login");
});

function isNotBot(req, res, next) {
  if (req.cookies.allowed === 'true') {
    next();
  } else {
    res.redirect("/captcha");
  }
}

app.get("/api/allow", async (req, res) => {
  const oneWeekFromNow = new Date();
  oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

  res.cookie("allowed", 'true', { expires: oneWeekFromNow });
  res.redirect("/home");
});

app.get("/captcha", (req, res) => {
  res.render("captcha_made_in_china");
})

app.get("/bot", (req, res) => {
  res.render("errors/bot");
})

app.get("/", isNotBot, (req, res) => {
  res.redirect("signup");
});

app.post("/api/login", isNotBot, cors(), async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await usersCollection.findOne({ username });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication failed" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      logger.info(`User "${user.username}" tried to log but used an incorrect password`);
      return res
        .status(401)
        .json({ success: false, message: "Authentication failed" });
    }

    if (!user.token) {
      logger.info(`User "${user.username}" tried to log in but no token was found`);
      return res
        .status(401)
        .json({ success: false, message: "Token not found" });
    }

    if (user.banned === true) {
      logger.info(`User "${user.username}" tried to log in but was banned`);
      return res
        .status(401)
        .json({ success: false, message: "Account suspended." });
    }

    const token = user.token;

    const userIP = req.ip;

    if (!user.AllowedIPs || !user.AllowedIPs.includes(userIP)) {
      user.AllowedIPs = user.AllowedIPs || [];
      user.AllowedIPs.push(userIP);
      await usersCollection.updateOne({ username }, { $set: { AllowedIPs: user.AllowedIPs } });
    }
    res.cookie("token", token, { httpOnly: true });

    logger.info(`User "${user.username}" logged in`);
    res.json({ success: true });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/signup", isNotBot, async (req, res) => {
  const token = req.cookies.token;

  if (token) {
    try {
      const user = await usersCollection.findOne({ token });

      if (user) {
        return res.redirect("/home");
      }
    } catch (error) {
      console.error("Error checking token in MongoDB:", error);
      logger.error("Error checking token in MongoDB:", error);
    }
  }

  const username = req.query.username;
  const usernameRegex = /^[a-z0-9_]{3,20}$/;

  if (!usernameRegex.test(username)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid username format" });
  }

  res.render("signup");
});

app.get("/cdn", (req, res) => {
  const cdnDirectory = "/cdn";

  fs.readdir(cdnDirectory, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      logger.error("Error reading directory:", err);

      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }

    res.json({ success: true, files });
  });
});

app.get("/settings", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    res.render("settings/settings");
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
    logger.error("Error checking token in MongoDB:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/settings/profile", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    res.render("settings/profile", { user, successMessage: null });
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
    logger.error("Error checking token in MongoDB:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/settings/account", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    res.render("settings/account", { user, successMessage: null });
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
    logger.error("Error checking token in MongoDB:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/settings/privacy", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    res.render("settings/privacy", { user, successMessage: null });
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
    logger.error("Error checking token in MongoDB:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/blog", checkUserBanStatus, isNotBot, async (req, res) => {
    res.render("blog");
});

app.post("/api/change-description", urlencodedParser, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    const newDescription = req.body.description;

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { description: newDescription } }
    );

    res.json({ success: true, message: "Changed description sucsesfuly" });
  } catch (error) {
    console.error("Error updating description:", error);
    logger.error("Error updating description:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/change-username", urlencodedParser, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    const newUsername = req.body.username;

    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(newUsername)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid username format." });
    }

    const existingUser = await usersCollection.findOne({ username: newUsername });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Username already exists." });
    }

    if (user.usernameChanged) {
      return res
        .status(400)
        .json({ success: false, message: "Username already changed." });
    }

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: { username: newUsername, usernameChanged: true }
      }
    );

    res.status(200).json({ success: true, message: "Username changed successfully." });
  } catch (error) {
    console.error(error);
    logger.error(error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/api/delete-account", urlencodedParser, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const { username, password } = req.body;
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    if (user.username !== username) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication failed" });
    }

    if (!username & !password) {
      return res.status(401).json({ success: false, message: "Invalid credentials." });
    }

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: { deleted: true, description: null, username: null, password: null, token: null, referal: null, profilePicture: null, styleFile: null }
      }
    );

    res.status(200).json({ success: true, message: "Account deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/api/upload-profile-picture", checkUserBanStatus, cors(), async (req, res) => {
    const token = req.cookies.token;

    if (!token) {
      return res.redirect("/login");
    }

    try {
      const user = await usersCollection.findOne({ token });

      if (!user) {
        return res.redirect("/login");
      }

      if (!req.files || !req.files.profilePicture) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded." });
      }

      const profilePicture = req.files.profilePicture;
      const userId = user.id;

      const timestamp = Date.now();
      const fileExtension = profilePicture.name.split(".").pop();
      const filename = `${userId}/${timestamp}.${fileExtension}`;

      const filePath = path.join(__dirname, "cdn", "uploads", filename);

      const directoryPath = path.dirname(filePath);

      fs.mkdirSync(directoryPath, { recursive: true });

      profilePicture.mv(filePath, async (err) => {
        if (err) {
          console.error("Error saving profile picture:", err);
          return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
        }

        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { profilePicture: filename } }
        );

        res.json({
          success: true,
          message: "Profile picture uploaded successfully.",
        });
      });
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

app.post("/api/upload-style", checkUserBanStatus, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    if (!req.files || !req.files.styleFile) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded." });
    }

    const styleFile = req.files.styleFile;
    const userId = user.id;

    const timestamp = Date.now();
    const fileExtension = styleFile.name.split(".").pop();
    if (fileExtension !== "cblstyle") {
      return res.status(500).json({
        success: false,
        message: "File extention needs to be .cblstyle",
      });
    }
    const filename = `${userId}/${timestamp}.css`;

    const filePath = path.join(__dirname, "cdn", "uploads", filename);

    const directoryPath = path.dirname(filePath);

    fs.mkdirSync(directoryPath, { recursive: true });

    styleFile.mv(filePath, async (err) => {
      if (err) {
        console.error("Error saving profile picture:", err);
        return res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }

      await usersCollection.updateOne(
        { _id: user._id },
        { $set: { StyleFile: `uploads/${filename}` } }
      );

      res.json({ success: true, message: "Style uploaded successfully." });
    });
  } catch (error) {
    console.error("Error uploading style:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/change-style", checkUserBanStatus, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    const selectedStyle = req.body.styleFile;

    const styleFilePaths = {
      none: "files/styles/none.css",
      midnight: "files/styles/midnight.css",
      white: "files/styles/white-simple.css",
      idk: "files/styles/idkSomeThemeIg.css",
      //spooky: "files/styles/spooky.css",
      snow: "files/styles/snow.css",
    };

    if (!styleFilePaths[selectedStyle]) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid style selected." });
    }

    const userId = user.id;

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { StyleFile: styleFilePaths[selectedStyle] } }
    );

    res.json({ success: true, message: "Style changed successfully." });
  } catch (error) {
    console.error("Error changing style:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/send-friendrequest", jsonParser, async (req, res) => {
  const senderUserId = req.body.senderUserId;
  const recipientUserId = req.body.recipientUserId;

  if (!recipientUserId || !senderUserId) {
    return res.status(400).json({ success: false, message: "Invalid request: recipientUserId and senderUserId are required" });
  }

  // console.log("Sender User ID:", senderUserId);
  // console.log("Recipient User ID:", recipientUserId);

  try {
    const recipientUser = await usersCollection.findOne({ _id: new ObjectId(recipientUserId) });

    if (!recipientUser) {
      console.log("Recipient User not found:", recipientUserId);
      return res.status(404).json({ success: false, message: "Recipient user not found" });
    }

    // Initialize pendingFriendRequests field if it's undefined
    recipientUser.pendingFriendRequests = recipientUser.pendingFriendRequests || [];

    // Check if the senderUserId is already in the pendingFriendRequests array
    if (recipientUser.pendingFriendRequests.includes(senderUserId)) {
      return res.status(400).json({ success: false, message: "Friend request already exists" });
    }

    // Add senderUserId to the pendingFriendRequests array
    recipientUser.pendingFriendRequests.push(senderUserId);

    await usersCollection.updateOne(
      { _id: new ObjectId(recipientUserId) },
      { $set: { pendingFriendRequests: recipientUser.pendingFriendRequests } }
    );

    res.json({ success: true, message: "Friend request sent" });
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/accept-friendrequest", jsonParser, async (req, res) => {
  const userId = req.body.userId; // The user who is accepting the friend request
  const senderUserId = req.body.senderUserId; // The user who sent the friend request

  if (!userId || !senderUserId) {
    return res.status(400).json({ success: false, message: "Invalid request: userId and senderUserId are required" });
  }

  console.log("User ID:", userId);
  console.log("Sender User ID:", senderUserId);

  try {
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

    if (!user) {
      console.log("User not found:", userId);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Check if the senderUserId is in the user's pendingFriendRequests
    if (!user.pendingFriendRequests.includes(senderUserId)) {
      return res.status(400).json({ success: false, message: "Friend request not found" });
    }

    // Remove senderUserId from pendingFriendRequests
    user.pendingFriendRequests = user.pendingFriendRequests.filter(id => id !== senderUserId);

    // Add senderUserId to the friends list
    user.friends = user.friends || [];
    user.friends.push(senderUserId);

    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { pendingFriendRequests: user.pendingFriendRequests, friends: user.friends } }
    );

    res.json({ success: true, message: "Friend request accepted" });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/profile", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    res.redirect(`/user/${user.id}`);
  } catch (error) {
    console.error("Error checking token in MongoDB:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/user", async (req, res) => {
  try {
    const { username } = req.query;

    if (!username) {
      return res.redirect("/home");
    }

    const searchResults = await usersCollection
      .find({ username: { $regex: username, $options: "i" } })
      .toArray();

    searchResults.sort((a, b) => {
      const accuracyA = calculateAccuracy(username, a.username);
      const accuracyB = calculateAccuracy(username, b.username);
      return accuracyB - accuracyA;
    });

    res.render("search", { searchResults });
  } catch (error) {
    console.error("Error searching for users:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/user/:userId", checkUserBanStatus, isNotBot, async (req, res) => {
  const userId = req.params.userId;
  const token = req.cookies.token;

  try {
    const reqUser = await usersCollection.findOne({ id: parseInt(userId) });
    const user = await usersCollection.findOne({ token });

    if (!reqUser) {
      return res.status(404).render("errors/404", { path: req.path, user });
    }

    if (reqUser.banned === true) {
      return res.status(404).render("errors/404", { path: req.path, user });
    }

    if (reqUser.deleted === true) {
      return res.status(404).render("errors/404", { path: req.path, user });
    }

    const recentMessages = await PostCollection
      .find({ 'sender.id': reqUser.id })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    res.render("user", { reqUser, user, recentMessages });
  } catch (error) {
    console.error("Error retrieving user information:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/post-message", jsonParser, checkUserRateLimit, checkGlobalRateLimit, cors(), async (req, res) => {
    const token = req.cookies.token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Token not found." });
    }

    try {
      const user = await usersCollection.findOne({ token });

      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized. Invalid token." });
      }

      const { messageContent } = req.body;

      if (!messageContent) {
        return res
          .status(400)
          .json({ success: false, message: "Message content is required." });
      }

      const message = {
        timestamp: Date.now(),
        content: messageContent.split("\n"),
        sender: {
          id: user.id,
          messageid: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
        },
      };

      const result = await PostCollection.insertOne(message);

      if (result.insertedCount === 1) {
        res
          .status(201)
          .json({ success: true, message: "Message posted successfully." });
      } else {
        res
          .status(500)
          .json({ success: false, message: "Failed to post message." });
      }
    } catch (error) {
      console.error("Error posting message:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);

app.delete("/api/delete-reply/:messageId/:replyId", cors(), async (req, res) => {
  const token = req.cookies.token;
  const messageId = req.params.messageId;
  const replyId = req.params.replyId;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    const isAdmin = user.id === 1 || user.id === 3 || user.id === 7;
    const message = await PostCollection.findOne({
      _id: new ObjectId(messageId),
    });

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found." });
    }

    const replyToDelete = message.replies.find(
      (reply) => reply._id.toString() === replyId
    );

    if (!replyToDelete) {
      return res
        .status(404)
        .json({ success: false, message: "Reply not found." });
    }

    if (!isAdmin && replyToDelete.sender.id !== user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. You cannot delete this reply.",
      });
    }

    await PostCollection.updateOne(
      { _id: new ObjectId(messageId) },
      {
        $pull: {
          replies: { _id: new ObjectId(replyId) },
        },
      }
    );

    res
      .status(204)
      .json({ success: true, message: "Reply deleted successfully." });
  } catch (error) {
    console.error("Error deleting reply:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/reply/:messageId", jsonParser, checkUserRateLimit, checkGlobalRateLimit, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
      const user = await usersCollection.findOne({ token });

      if (!user) {
          return res.status(401).json({ success: false, message: "Unauthorized. Invalid token." });
      }

      const { messageContent } = req.body;

      if (!messageContent) {
          return res.status(400).json({ success: false, message: "Message content is required." });
      }

      const messageId = req.params.messageId;
      const parentMessage = await PostCollection.findOne({ _id: new ObjectId(messageId) });

      if (!parentMessage) {
        return res.status(404).json({ success: false, message: "Parent message not found." });
      }

      const reply = {
          timestamp: Date.now(),
          content: messageContent.split("\n"),
          sender: {
              id: user.id,
              messageid: user._id,
              username: user.username,
              profilePicture: user.profilePicture,
          },
      };

      const result = await PostCollection.updateOne(
        { _id: new ObjectId(messageId) },
        { $push: { replies: reply } }
      );
  
      if (result.modifiedCount === 1) {
          res.status(201).json({
              success: true,
              message: "Reply posted successfully.",
              reply,
          });
      } else {
          res.status(500).json({
              success: false,
              message: "Failed to post reply.",
          });
      }
} catch (error) {
      console.error("Error posting reply:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/delete-message/:messageId", cors(), async (req, res) => {
  const token = req.cookies.token;
  const messageId = req.params.messageId;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const messageObjectId = new ObjectId(messageId);
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    const isAdmin = user.id === 1 || user.id === 3;
    const message = await PostCollection.findOne({
      _id: new ObjectId(messageId),
    });

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: "Message not found." });
    }

    if (!isAdmin && message.sender.id !== user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized. You cannot delete this message.",
      });
    }

    await PostCollection.deleteOne({ _id: new ObjectId(messageId) });

    res
      .status(204)
      .json({ success: true, message: "Message deleted successfully." });
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/signup", cors(), async (req, res) => {
  try {
    const { username, password, referal } = req.body;

    const usernameRegex = /^[a-z0-9_]{3,20}$/;

    if (!usernameRegex.test(username)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid username format" });
    }

    const userExists = await usersCollection.findOne({ username });

    if (userExists) {
      return res
        .status(409)
        .json({ success: false, message: "Username already exists." });
    }

    const userCount = await usersCollection.countDocuments();

    const id = userCount + 1;

    const saltRounds = 15;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const token = generateToken(id, username, hashedPassword);

    const newUser = {
      id,
      username,
      password: hashedPassword,
      token,
      referal,
      AllowedIPs: [req.ip],
      joinedTime: Date.now(),
    };

    await usersCollection.insertOne(newUser);

    res.cookie("token", token, { httpOnly: true });

    res.redirect("/home");
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/home", checkUserBanStatus, urlencodedParser, isNotBot, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }

    const profilePictureURL = `/cdn/uploads/${user.profilePicture}`;

    const recentMessages = await PostCollection.find()
      .sort({ timestamp: -1 })
      .limit(25) // 20 messages on home page
      .toArray();

    recentMessages.forEach((message) => {
      message.formattedDate = new Date(message.timestamp).toLocaleString();
    });

    res.render("home", { user, recentMessages });
  } catch (error) {
    console.error("Error checking token or retrieving messages:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/admin", checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(403).render("errors/403", { path: req.path, user });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.status(403).render("errors/403", { path: req.path, user });
    }

    if (user.id === 1) {
      res.render("admin");
    } else {
      return res.status(403).render("errors/403", { path: req.path, user });
    }
  } catch (error) {
    console.error(
      "Error checking token or retrieving user information:",
      error
    );
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get('/admin/logs', checkUserBanStatus, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(403).render("errors/403", { path: req.path, user });
  }
  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.status(403).render("errors/403", { path: req.path, user });
    }

    if (user.id === 1) {
      const logDirectory = path.join(__dirname, 'logs');

      fs.readdir(logDirectory, (err, files) => {
        if (err) {
          return res.status(500).send('Error reading log files.');
        }
  
        // Filter out only the log files (assuming they have a ".log" extension)
        const logFiles = files.filter(file => file.endsWith('.log'));
  
        // Find the newest log file based on file name (assuming file names are in the format "dd-mm-yyyy.log")
        const newestLogFile = logFiles.reduce((newest, file) => {
          const fileDate = new Date(file.split('.')[0]); // Parse the date from the file name
          if (!newest || fileDate > newest.date) {
            return { date: fileDate, name: file };
          }
          return newest;
        }, null);
  
        if (!newestLogFile) {
          return res.status(404).send('No log files found.');
        }
  
        // Read and send the content of the newest log file
        const newestLogFilePath = path.join(logDirectory, newestLogFile.name);
        fs.readFile(newestLogFilePath, 'utf8', (err, data) => {
          if (err) {
            return res.status(500).send('Error reading the newest log file.');
          }
  
          res.send(`<pre>${data}</pre>`);
        });
      });  
    } else {
      return res.status(403).render("errors/403", { path: req.path, user });
    }
  } catch (error) {

  }
});

app.get("/api/logout", cors(), (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

/* sinyvile */

app.get("/sinyvile", async (req, res) => {
  res.redirect("/sinyvile/home");
})

app.get("/sinyvile/home", checkUserBanStatus, urlencodedParser, isNotBot, async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect("/login");
    }
  
    if (!user.sin) {
      return res.redirect("/sinyvile/not-allowed");
    }

    const profilePictureURL = `/cdn/uploads/${user.profilePicture}`;

    const recentMessages = await SinPostCollection.find()
      .sort({ timestamp: -1 })
      .limit(25) // 20 messages on home page
      .toArray();

    recentMessages.forEach((message) => {
      message.formattedDate = new Date(message.timestamp).toLocaleString();
    });

    res.render("sinyvile/home", { user, recentMessages });
  } catch (error) {
    console.error("Error checking token or retrieving messages:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/sin/post-message", jsonParser, checkUserRateLimit, checkGlobalRateLimit, cors(), async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    if (!user.sin) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Not a sinyland member." });
    }

    const { messageContent } = req.body;
    // console.log(messageContent);

    if (!messageContent) {
      return res
        .status(400)
        .json({ success: false, message: "Message content is required." });
    }

    const message = {
      timestamp: Date.now(),
      content: messageContent.split("\n"),
      sender: {
        id: user.id,
        messageid: user._id,
        username: user.username,
        profilePicture: user.profilePicture,
      },
    };

    const result = await SinPostCollection.insertOne(message);

    if (result.insertedCount === 1) {
      res
        .status(201)
        .json({ success: true, message: "Message posted successfully." });
    } else {
      res
        .status(500)
        .json({ success: false, message: "Failed to post message." });
    }
  } catch (error) {
    console.error("Error posting message:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
}
);

app.delete("/api/sin/delete-message/:messageId", cors(), async (req, res) => {
const token = req.cookies.token;
const messageId = req.params.messageId;

if (!token) {
  return res
    .status(401)
    .json({ success: false, message: "Unauthorized. Token not found." });
}

try {
  const messageObjectId = new ObjectId(messageId);
  const user = await usersCollection.findOne({ token });

  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Invalid token." });
  }

  const isAdmin = user.id === 1 || user.id === 3 || user.id === 7;
  const message = await SinPostCollection.findOne({
    _id: new ObjectId(messageId),
  });

  if (!message) {
    return res
      .status(404)
      .json({ success: false, message: "Message not found." });
  }

  if (!isAdmin && message.sender.id !== user.id) {
    return res.status(403).json({
      success: false,
      message: "Unauthorized. You cannot delete this message.",
    });
  }

  await SinPostCollection.deleteOne({ _id: new ObjectId(messageId) });

  res
    .status(204)
    .json({ success: true, message: "Message deleted successfully." });
} catch (error) {
  console.error("Error deleting message:", error);
  res.status(500).json({ success: false, message: "Internal server error" });
}
});

app.post("/api/generate-invite", async (req, res) => {
  const token = req.cookies.token;
  const messageId = req.params.messageId;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized. Invalid token." });
    }

    if (!user.id === 1 || !user.id === 3 || !user.id === 7) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized. Only admins can generate invites." });
    }
    const userId = user.userId; // Assuming you have a user object with an ID
    const currentMonth = new Date().getMonth();
    /* const inviteCount = await invitesCollection.countDocuments({
      createdBy: userId,
      createdAt: { $gte: new Date(currentMonth) },
    });

    if (inviteCount >= 5) {
      return res.status(403).json({ success: false, message: "Invite limit reached for this month" });
    }*/

    const inviteCode = generateUniqueInviteCode();

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await InvitesCollection.insertOne({
      code: inviteCode,
      createdBy: user.username,
      createdAt: new Date(),
      expiresAt,
    });
    
    res.json({ success: true, inviteCode });
  } catch (error) {
    console.error("Error generating invite code:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/sinyvile/not-allowed", async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }
  
  try {
  const user = await usersCollection.findOne({ token });

  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Invalid token." });
  }

  res.render("sinyvile/not-allowed", {user});
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/sin/use-invite", async (req,res) => {
  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized. Invalid token." });
    }
      
    const inviteCode = req.body.inviteCode;

    if (!inviteCode) {
        return res.status(400).json({ success: false, message: "Invite code is required" });
    }
    
    const invite = await InvitesCollection.findOne({
        code: inviteCode,
        expiresAt: { $gt: new Date() },
    });
    
    if (!invite) {
        console.log('No invite found with code:', inviteCode);
        return res.status(401).json({ success: false, message: "Invalid or expired invite code" });
    }
    
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          sin: invite.code,
        },
      }
    );

    res.json({ success: true, message: "Invite code used successfully" });
  } catch (error) {
    console.error("Error using invite code:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
})

app.get("/sin/invites", async (req, res) => {
  const { messageId } = req.params;

  const token = req.cookies.token;

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized. Token not found." });
  }

  try {
    const user = await usersCollection.findOne({ token });

    if (!user) {
      return res.redirect('/login');
    }

    if (!user.id === "1" || !user.id === "3" ||!user.id === "7") {
      return res.redirect('/sinyvile/not-allowed');
    }

    if (!user.sin) {
      return res.redirect("/sinyvile/not-allowed");
    }

    const userInvites = await InvitesCollection.find().sort({ expiresAt: -1 }).toArray();

    res.render('sinyvile/invite', { user, userInvites });

  } catch (error) {
    console.error("Error fetching invites:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.use(async (req, res, next) => {
  const token = req.cookies.token
  try {
    const user = await usersCollection.findOne({ token });
    res.status(404).render("errors/404", { path: req.path, user });
  } catch (error) {
    console.error("Error checking token or retrieving user information:", error);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  logger.info(`Server started on port ${port}`);
  // console.log("Direct link: http://eeeeeeee-36474.portmap.host:36474/");
});

process.on("SIGINT", async () => {
  logger.info("Server closed connection");
  try {
    await client.close();
    console.log("MongoDB connection closed");
    logger.info("MongoDB connection closed");
    process.exit(0);
  } catch (error) {
    console.error("Error closing MongoDB connection:", error);
    logger.error("Error closing MongoDB connection:", error);
    process.exit(1);
  }
});
