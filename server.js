import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";

import multer from "multer";
import path from "path";
import fs from "fs";

import Database from "better-sqlite3";

const db = new Database("my_app.db");
db.pragma("journal_mode = WAL");


//////////////////////////////////////////////////
// Database setup
//////////////////////////////////////////////////

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
    )
    `
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    user_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
    )
    `
).run();


db.prepare(
    `
    CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tab_id INTEGER,
        user_id INTEGER,
        day_name TEXT,
        breakfast TEXT,
        lunch TEXT,
        dinner TEXT,
        FOREIGN KEY(tab_id) REFERENCES tabs(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    `
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS threads (

    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,

    FOREIGN KEY(user_id) REFERENCES users(id)
    )
    `
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS chats (

    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER,
    user_id INTEGER,
    content TEXT,
    image_path TEXT,
    role TEXT NOT NULL DEFAULT 'user',

    FOREIGN KEY(thread_id) REFERENCES threads(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
    )
    `
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS meal_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT NOT NULL,
    breakfast_done INTEGER DEFAULT 0,
    lunch_done INTEGER DEFAULT 0,
    dinner_done INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, date)
    )
    `
).run();

db.prepare(
    `
    CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE,
    main_tab_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(main_tab_id) REFERENCES tabs(id)
    )
    `
).run();

////////////////////////////////////////
//////////////////// UPLOAD IMAGE 
////////////////////////////////////////



const uploadDir = "uploads";

// Create folder if not exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "");
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images allowed"), false);
    }
  }
});


//////////////////// APP SETUP ////////////////////

const isProduction = process.env.NODE_ENV === "production";

const app = express();

app.use(cors({
    origin: isProduction
        ? "https://your-frontend-domain.com"
        : "http://127.0.0.1:5500",
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use(express.static("../frontend"));
app.use("/uploads", express.static("uploads"));

app.use(function(req, res, next){
    // decode cookie
    try{
        const decoded = jwt.verify(req.cookies.logged, process.env.JWTSECRET);
        req.user = decoded;
    } 
    catch(err){
        req.user = null;
    }

    next();
});





function isLoggedIn(req, res, next){
    if (req.user){
        return next();
    }
    return res.status(403).json({ error: "Unauthorized" });
}

function isAdmin(req, res, next){
    if (req.user?.role === "admin"){
        return next();
    }
    return res.status(403).json({ error: "Forbidden Access" });
}


// Cookie
function sendAuthCookie(res, user) {
  const token = jwt.sign(
    {
        username: user.username,
        id: user.id
    },
    process.env.JWTSECRET
    );

    // already defined const isProduction = process.env.NODE_ENV === "production";

    res.cookie("logged", token, {
        httpOnly: true,
        secure: isProduction ? true : false,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

// httpsPassword_12345

//////////////////// REGISTER API ////////////////////

app.post("/api/register", (req, res) => {

    const errors = [];

    let { username, password } = req.body;

    if (typeof username !== "string") username = "";
    if (typeof password !== "string") password = "";

    username = username.trim();

    // Username conditions
    if (!/^[a-zA-Z0-9]+$/.test(username)) errors.push("Username must be alphanumeric.");
    if (username.length < 3) errors.push("Username must be at least 3 characters long");
    if (username.length > 10) errors.push("Username can only be at most 10 characters long.")

    const existed = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (existed) errors.push("Username already exists.");

    // Password conditions
    if (password.length < 8) errors.push("Password must be at least 8 characters long.");
    if (password.length > 50) errors.push("Password can only be at most 50 characters long.")

    if (errors.length) return res.status(400).json({ errors });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hash);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);

    sendAuthCookie(res, user);
    res.json({ success: true });
});


//////////////////// LOGIN API ///////////////////

app.post("/api/login", (req, res) => {

    const errors = [];

    const { username, password } = req.body;

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!user) errors.push("Invalid username/password.");

    if (user) {
        const match = bcrypt.compareSync(password, user.password);

        if (!match) errors.push("Invalid username/password.");
    }

    if (errors.length)
    return res.status(400).json({ errors });

    sendAuthCookie(res, user);

    res.json({ success: true });
});


app.post("/api/logout", (req, res) => {
    res.clearCookie("logged", {
        httpOnly: true,
        secure: isProduction ? true : false,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
    });


  return res.json({ success: true });
});

//////////////////// AUTHENTIFICATION CHECK API ////////////////////

app.get("/api/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({ loggedIn: false });
  }
  res.json({ loggedIn: true, user: req.user });
});

//////////////////// RENAME API ////////////////////

app.put("/api/rename", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const newName = req.body.name;
    const password = req.body.password;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(400).json({ error: "Password is incorrect" });

    if (typeof newName !== "string" || newName.trim().length < 3 || newName.trim().length > 10 || !/^[a-zA-Z0-9]+$/.test(newName)) {
        return res.status(400).json({ error: "Invalid name" });
    }
    db.prepare(
        `
        UPDATE users
        SET username = ?
        WHERE id = ?
        `
    ).run(newName, userId);

    res.json({ success: true });
});


//////////////////// CHANGE PASSWORD API ////////////////////

app.put("/api/change-password", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const match = bcrypt.compareSync(oldPassword, user.password);
    if (!match) return res.status(400).json({ error: "Old password is incorrect" });

    if (newPassword.length < 8 || newPassword.length > 50) {
        return res.status(400).json({ error: "New password must be between 8 and 50 characters long" });
    }
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newHash, userId);
    res.json({ success: true });
});

//////////////////// DELETE ACCOUNT API ////////////////////

app.delete("/api/delete-account", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const password = req.body.password;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const match = bcrypt.compareSync(password, user.password);
    if (!match) return res.status(400).json({ error: "Password is incorrect" });
    
    try {
        // Get all chats with images for this user
        const chats = db.prepare(
            `SELECT image_path FROM chats WHERE user_id = ?`
        ).all(userId);

        // Delete image files
        chats.forEach(chat => {
            if (chat.image_path) {
                try {
                    const imagePaths = JSON.parse(chat.image_path);
                    if (Array.isArray(imagePaths)) {
                        imagePaths.forEach(imgPath => {
                            if (fs.existsSync(imgPath)) {
                                fs.unlinkSync(imgPath);
                                console.log(`[DELETE ACCOUNT] Removed image: ${imgPath}`);
                            }
                        });
                    }
                } catch (e) {
                    console.error(`[DELETE ACCOUNT] Error parsing image_path:`, e);
                }
            }
        });

        // Delete all user data from database
        db.prepare("DELETE FROM threads WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM tabs WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM blocks WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM chats WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
        
        res.clearCookie("logged", {
            httpOnly: true,
            secure: isProduction ? true : false,
            sameSite: isProduction ? "none" : "lax",
            path: "/",
        });
        res.json({ success: true });
    } catch (err) {
        console.error('[DELETE ACCOUNT ERROR]', err);
        res.status(500).json({ error: "Failed to delete account", details: err.message });
    }
});



//////////////////// TAB QUERY FUNCTION ////////////////////

function getTab(tabId, userId){
    const tab = db.prepare("SELECT * FROM tabs WHERE id = ? AND user_id = ?").get(tabId, userId);
    return tab;
}

function getBlock(blockId, userId){
    const block = db.prepare("SELECT * FROM blocks WHERE id = ? AND user_id = ?").get(blockId, userId);
    return block;
}

function isTabOwner(req, res, next){
    const userId = req.user.id;
    const tabId = req.params.tab_id; 
    const tab = getTab(tabId, userId);
    if (tab) return next();

    return res.status(404).json({error: "Tab not found"});
}

function isBlockOwner(req, res, next){
    const userId = req.user.id;
    const tabId = req.params.tab_id;
    const blockId = req.params.block_id;

    const tab = getTab(tabId, userId);
    if (!tab){
        return res.status(404).json({error: "Tab not found"});
    }
    const block = getBlock(blockId, userId);
    if (!block){
        return res.status(404).json({error: "Block not found"});
    }
    return next();
}

//////////////////// CREATE TAB ////////////////////

app.post("/api/create-tab", isLoggedIn, (req, res) => {
    
    const name = req.body.name;
    const userId = req.user.id;
    

    const result = db.prepare(
        `
        INSERT INTO tabs (name, user_id)
        VALUES (?, ?)
        `
    ).run(name, userId);

    return res.status(201).json({ success: true, tab_id: result.lastInsertRowid });
});

//////////////////// GET ALL USER TABS ////////////////////

app.get("/api/tabs", isLoggedIn, (req, res) => {
    const userId = req.user.id;

    const tabs = db.prepare(
        `
        SELECT * FROM tabs
        WHERE user_id = ?
        `
    ).all(userId);

    // if (!tabs) return res.status(404).json({ error: "Tab not found" });
    
    return res.status(200).json({success: true, tabs});
});

//////////////////// GET A USER TAB ////////////////////

app.get("/api/tab/:tab_id", isLoggedIn, (req, res) =>{
    const userId = req.user.id;
    const tabId = req.params.tab_id;

    const tab = getTab(tabId, userId);
    if (!tab) return res.status(404).json({ error: "Tab not Found" });
    
    return res.status(200).json({success: true, tab});
});

//////////////////// EDIT TAB NAME ////////////////////

app.put("/api/edit-tab/:tab_id", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const tabId = req.params.tab_id;
    const newName = req.body.name;

    const tab = getTab(tabId, userId);

    if (!tab) return res.status(404).json({ error: "Tab not found" });

    db.prepare(`
        UPDATE tabs
        SET name = ?
        WHERE id = ?
    `).run(newName, tabId);

    res.json({ success: true });
});

//////////////////// DELETE TAB ////////////////////

app.delete("/api/delete-tab/:tab_id", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const tabId = req.params.tab_id;

    db.prepare(
        `DELETE FROM blocks
        WHERE tab_id = ? AND user_id = ?
        `
    ).run(tabId, userId);

    db.prepare(
        `DELETE FROM tabs
        WHERE id = ? AND user_id = ?`
    ).run(tabId, userId);

    res.json({ success: true });
});


//////////////////// CREATE A BLOCK ////////////////////

app.post("/api/tab/:tab_id/create-block", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const tabId = req.params.tab_id;

    const {
        day_name,
        breakfast,
        lunch,
        dinner
        } = req.body;

    const result = db.prepare(`
        INSERT INTO blocks
        (tab_id, user_id, day_name, breakfast, lunch, dinner)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        tabId,
        userId,
        day_name,
        breakfast,
        lunch,
        dinner
    );

    res.status(201).json({ success: true, block_id: result.lastInsertRowid });
});

//////////////////// GET ALL BLOCKS ////////////////////

app.get("/api/tab/:tab_id/blocks", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const tabId = req.params.tab_id;

    const blocks = db.prepare(`
        SELECT * FROM blocks
        WHERE tab_id = ? AND user_id = ?
        ORDER BY id
    `).all(tabId, userId);

    res.status(200).json({success:true, blocks});
});

//////////////////// GET A BLOCK ////////////////////

app.get("/api/tab/:tab_id/block/:block_id", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const blockId = req.params.block_id;

    const block = getBlock(blockId, userId);

    if (!block) return res.status(404).json({error: "Block not found"});

    res.status(200).json({success: true, block});

});

//////////////////// EDIT A BLOCK ////////////////////

app.put("/api/edit-block/tab/:tab_id/block/:block_id", isLoggedIn, isTabOwner, (req, res) => {
    const userId = req.user.id;
    const blockId = req.params.block_id;

    const block = getBlock(blockId, userId);
    if (!block) return res.status(404).json({error: "Block not found"});

    const { day_name, breakfast, lunch, dinner } = req.body;

    db.prepare(
        `UPDATE blocks 
        SET day_name = ?, breakfast = ?, lunch = ?, dinner = ? 
        WHERE id = ? AND user_id = ?
        `).run(
        day_name || block.day_name,
        breakfast || block.breakfast,
        lunch || block.lunch,
        dinner || block.dinner,
        blockId, userId
    );

    res.status(200).json({ success: true });
});

//////////////////// DELETE A BLOCK ////////////////////

app.delete("/api/delete-block/tab/:tab_id/block/:block_id", isLoggedIn, isBlockOwner, (req, res) => {
    const userId = req.user.id;
    const blockId = req.params.block_id;

    db.prepare(
        `DELETE FROM blocks 
        WHERE id = ? AND user_id = ?`
    ).run(blockId, userId);

    res.json({ success: true });
});


//////////////////// GET FEEDBACK FROM AI ////////////////////



////////////////////////////////////////////
//////////////////// AI ////////////////////
////////////////////////////////////////////



//////////////////// CREATE A THREAD ////////////////////

app.post("/api/create-thread", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const name = req.body.name;

    const result = db.prepare(
        `INSERT INTO threads (user_id, name)
        VALUES (?, ?)
        `
    ).run(userId, name);

    res.status(201).json({
        success: true, 
        thread_id: result.lastInsertRowid
    });
});

//////////////////// THREAD QUERY FUNCTION ////////////////////

function getThread(threadId, userId){
    const thread = db.prepare(
        `SELECT * FROM threads
        WHERE id = ? AND user_id = ?
        `
    ).get(threadId, userId);
    return thread;
}

function isThreadOwner(req, res, next){
    const userId = req.user.id;
    const threadId = req.params.thread_id;
    const thread = getThread(threadId, userId);

    if (thread) return next();
    res.status(404).json({error: "Thread not found"});
}

//////////////////// GET ALL THREADS ////////////////////

app.get("/api/threads", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    
    const threads = db.prepare(
        `SELECT id, name FROM threads
        WHERE user_id = ?
        `).all(userId);
    
    res.status(200).json({
        success: true, 
        threads
    });
});

//////////////////// GET A THREAD ////////////////////

app.get("/api/thread/:thread_id", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;
    
    const thread = getThread(threadId, userId);
    if (!thread) return res.status(404).json({error: "Thread not found"});
    
    res.status(200).json({
        success: true, 
        thread
    });
});

//////////////////// EDIT A THREAD NAME ////////////////////

app.put("/api/edit-thread/:thread_id", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;

    const thread = getThread(threadId, userId);
    if (!thread) return res.status(404).json({error: "Thread not found"});

    const name = req.body.name;

    db.prepare(
        `UPDATE threads
        SET name = ?
        WHERE id = ? AND user_id = ?`
    ).run(name, threadId, userId);

    res.status(200).json({success: true});
});

//////////////////// DELETE A THREAD ////////////////////

app.delete("/api/delete-thread/:thread_id", isLoggedIn, isThreadOwner, (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;

    try {
        // Get all chats with images for this thread
        const chats = db.prepare(
            `SELECT image_path FROM chats WHERE thread_id = ?`
        ).all(threadId);

        // Delete image files
        chats.forEach(chat => {
            if (chat.image_path) {
                try {
                    const imagePaths = JSON.parse(chat.image_path);
                    if (Array.isArray(imagePaths)) {
                        imagePaths.forEach(imgPath => {
                            if (fs.existsSync(imgPath)) {
                                fs.unlinkSync(imgPath);
                                console.log(`[DELETE] Removed image: ${imgPath}`);
                            }
                        });
                    }
                } catch (e) {
                    console.error(`[DELETE] Error parsing image_path:`, e);
                }
            }
        });

        // Delete chats and thread from database
        db.prepare(
            `DELETE FROM chats WHERE thread_id = ?`
        ).run(threadId);

        db.prepare(
            `DELETE FROM threads WHERE id = ? AND user_id = ?`
        ).run(threadId, userId);

        res.status(200).json({success: true});
    } catch (err) {
        console.error('[DELETE THREAD ERROR]', err);
        res.status(500).json({ error: "Failed to delete thread", details: err.message });
    }
});

//////////////////// QUERY ////////////////////

function getChats(threadId, userId){
    return db.prepare(
        `SELECT role, content, image_path
        FROM chats
        WHERE thread_id = ? AND user_id = ?
        ORDER BY id ASC
    `).all(threadId, userId);
}




//////////////////// SEND A CHAT ////////////////////

import {askAI} from "./ai_modules.js";
app.post(
  "/api/thread/:thread_id/send-chat",
  isLoggedIn,
  isThreadOwner,
  upload.array("images", 3), // allow up to 3 images
  async (req, res) => {

    const userId = req.user.id;
    const threadId = req.params.thread_id;
    const content = req.body.content || "";
    const files = req.files || [];


    // Save user message
    db.prepare(
        `INSERT INTO chats (thread_id, user_id, content, image_path, role)
        VALUES (?, ?, ?, ?, 'user')
    `).run(
      threadId,
      userId,
      content,
      files.length ? JSON.stringify(files.map(f => f.path)) : null
    );

    // Get chat history
    const chats = db.prepare(`
        SELECT role, content, image_path
        FROM chats
        WHERE thread_id = ? AND user_id = ?
        ORDER BY id DESC
        LIMIT 10
    `).all(threadId, userId).reverse();

    // Build OpenAI messages
    const messages = [];

    // Process chat history WITHOUT images
    for (const chat of chats) {
      messages.push({
        role: chat.role,
        content: chat.content
      });
    }

    // Add current message with images if present
    if (files.length > 0) {
      const imagePaths = files.map(f => f.path);
      const contentArray = [];

      if (content) {
        contentArray.push({
          type: "text",
          text: content
        });
      }

      for (const imgPath of imagePaths) {
        const imageBase64 = fs.readFileSync(imgPath, { encoding: "base64" });

        const ext = path.extname(imgPath).toLowerCase();
        const mime =
            ext === ".png" ? "image/png" :
            ext === ".webp" ? "image/webp" :
            "image/jpeg";

        contentArray.push({
            type: "image_url",
            image_url: {
            url: `data:${mime};base64,${imageBase64}`
            }
        });
      }

      // Replace the last user message (current one) with images
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages[messages.length - 1].content = contentArray;
      }
    }

    // Ask AI
    let aiResponse;

    try {
      aiResponse = await askAI(messages);
    } catch (err) {

      const failMsg = "Sorry, AI is temporarily unavailable.";

      db.prepare(`
        INSERT INTO chats (thread_id, user_id, content, role)
        VALUES (?, ?, ?, 'assistant')
      `).run(threadId, userId, failMsg);

      return res.status(500).json({ error: "AI failed" });
    }

    // Save assistant reply
    db.prepare(`
      INSERT INTO chats (thread_id, user_id, content, role)
      VALUES (?, ?, ?, 'assistant')
    `).run(threadId, userId, aiResponse);

    res.json({
      success: true,
      ai_response: aiResponse
    });
  }
);

//////////////////// GET ALL CHATS ////////////////////

// app.post(
//   "/api/thread/:thread_id/send-chat",
//   isLoggedIn,
//   isThreadOwner,
//   upload.array("images", 3), // allow up to 3 images
//   async (req, res) => {

//     const userId = req.user.id;
//     const threadId = req.params.thread_id;
//     const content = req.body.content || "";
//     const files = req.files || [];

//     // Save user message
//     db.prepare(`
//       INSERT INTO chats (thread_id, user_id, content, image_path, role)
//       VALUES (?, ?, ?, ?, 'user')
//     `).run(
//       threadId,
//       userId,
//       content,
//       files.length ? JSON.stringify(files.map(f => f.path)) : null
//     );

//     // Get chat history
//     const chats = db.prepare(`
//         SELECT role, content, image_path
//         FROM chats
//         WHERE thread_id = ? AND user_id = ?
//         ORDER BY id DESC
//         LIMIT 10
//     `).all(threadId, userId).reverse();

//     // Build OpenAI messages
//     const messages = [];

//     for (const chat of chats) {

//       // If message has images
//         messages.push({
//           role: chat.role,
//           content: chat.content
//         });
//     }

//     // Ask AI
//     let aiResponse;

//     try {
//       aiResponse = await askAI(messages);
//     } catch (err) {

//       const failMsg = "Sorry, AI is temporarily unavailable.";

//       db.prepare(`
//         INSERT INTO chats (thread_id, user_id, content, role)
//         VALUES (?, ?, ?, 'assistant')
//       `).run(threadId, userId, failMsg);

//       return res.status(500).json({ error: "AI failed" });
//     }

//     // Save assistant reply
//     db.prepare(`
//       INSERT INTO chats (thread_id, user_id, content, role)
//       VALUES (?, ?, ?, 'assistant')
//     `).run(threadId, userId, aiResponse);

//     res.json({
//       success: true,
//       ai_response: aiResponse
//     });
//   }
// );

app.get("/api/thread/:thread_id/chats", isLoggedIn, isThreadOwner, (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;

    const chats = getChats(threadId, userId);

    res.status(200).json({success: true, chats});

});

//////////////////// MEAL TRACKING API ////////////////////

app.post("/api/main-tab/set", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const { tabId } = req.body;

    // If tabId is null or 0, unset the main tab
    if (tabId === null || tabId === 0 || tabId === undefined) {
        const existing = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
        
        if (existing) {
            db.prepare("UPDATE user_settings SET main_tab_id = NULL WHERE user_id = ?")
                .run(userId);
        }
        
        return res.json({ success: true, main_tab_id: null });
    }

    // Verify tab belongs to user
    const tab = db.prepare("SELECT * FROM tabs WHERE id = ? AND user_id = ?").get(tabId, userId);
    if (!tab) {
        return res.status(404).json({ error: "Tab not found" });
    }

    // Check if settings exist for user
    const existing = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
    
    if (existing) {
        db.prepare("UPDATE user_settings SET main_tab_id = ? WHERE user_id = ?")
            .run(tabId, userId);
    } else {
        db.prepare("INSERT INTO user_settings (user_id, main_tab_id) VALUES (?, ?)")
            .run(userId, tabId);
    }

    res.json({ success: true, main_tab_id: tabId });
});

app.get("/api/main-tab", isLoggedIn, (req, res) => {
    const userId = req.user.id;

    const settings = db.prepare("SELECT main_tab_id FROM user_settings WHERE user_id = ?").get(userId);
    
    res.json({ 
        success: true, 
        main_tab_id: settings ? settings.main_tab_id : null 
    });
});

app.post("/api/meal-tracking/save", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const { date, breakfast_done, lunch_done, dinner_done } = req.body;

    if (!date) {
        return res.status(400).json({ error: "date is required" });
    }

    const existing = db.prepare(
        "SELECT * FROM meal_tracking WHERE user_id = ? AND date = ?"
    ).get(userId, date);

    if (existing) {
        db.prepare(
            "UPDATE meal_tracking SET breakfast_done = ?, lunch_done = ?, dinner_done = ? WHERE user_id = ? AND date = ?"
        ).run(breakfast_done || 0, lunch_done || 0, dinner_done || 0, userId, date);
    } else {
        db.prepare(
            "INSERT INTO meal_tracking (user_id, date, breakfast_done, lunch_done, dinner_done) VALUES (?, ?, ?, ?, ?)"
        ).run(userId, date, breakfast_done || 0, lunch_done || 0, dinner_done || 0);
    }

    res.json({ success: true });
});

app.get("/api/meal-tracking/heatmap", isLoggedIn, (req, res) => {
    const userId = req.user.id;

    const data = db.prepare(
        "SELECT date, breakfast_done, lunch_done, dinner_done FROM meal_tracking WHERE user_id = ? ORDER BY date ASC"
    ).all(userId);

    // Transform data into heatmap format
    const heatmapData = {};
    data.forEach(row => {
        const value = (row.breakfast_done ? 1 : 0) + (row.lunch_done ? 1 : 0) + (row.dinner_done ? 1 : 0);
        heatmapData[row.date] = value;
    });

    res.json({ success: true, heatmap: heatmapData });
});

app.get("/api/meal-tracking/:date", isLoggedIn, (req, res) => {
    const userId = req.user.id;
    const { date } = req.params;

    const tracking = db.prepare(
        "SELECT breakfast_done, lunch_done, dinner_done FROM meal_tracking WHERE user_id = ? AND date = ?"
    ).get(userId, date);

    res.json({ 
        success: true, 
        breakfast_done: tracking?.breakfast_done || 0,
        lunch_done: tracking?.lunch_done || 0,
        dinner_done: tracking?.dinner_done || 0
    });
});

// db.prepare(`
//   ALTER TABLE chats
//   ADD COLUMN image_path TEXT
// `).run();




//////////////////////////////////////////////////

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});