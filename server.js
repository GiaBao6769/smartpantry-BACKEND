import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";

import multer from "multer";

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
        secure: false,
        sameSite: "lax",
        path: "/"
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
    if (!thread) return res.json(404).json({error: "Thread not found"});

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

    db.prepare(
        `DELETE FROM chats
        WHERE thread_id = ?`
    ).run(threadId);

    db.prepare(
        `DELETE FROM threads
        WHERE id = ? AND user_id = ?
        `
    ).run(threadId, userId);

    res.status(200).json({success: true});
});

//////////////////// QUERY ////////////////////

function getChats(threadId, userId){
    const chats = db.prepare(`
        SELECT role, content
        FROM chats
        WHERE thread_id = ? AND user_id = ?
        ORDER BY id ASC
    `).all(threadId, userId);
    return chats;
}

//////////////////// SEND A CHAT ////////////////////

import {askAI, analyzeImage} from "./ai_modules.js";

app.post( "/api/thread/:thread_id/send-chat", isLoggedIn, isThreadOwner, async (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;
    const content = req.body.content;

    // 1. Save user message

    db.prepare(`
        INSERT INTO chats (thread_id, user_id, content, role)
        VALUES (?, ?, ?, 'user')
    `).run(threadId, userId, content);

    // 2. Load full chat history

    const chats = getChats(threadId, userId);

    // 3. Build OpenAI messages

    const messages = [
      {
        role: "system",
        content: "You are a helpful nutritionist and chef"
      },
      ...chats.map(chat => ({
        role: chat.role,
        content: chat.content
      }))
    ];

    // 4. Ask AI

    let aiResponse;

    const aiReject = `Sorry, I can't answer your question right now. Please retry after a few minutes.`

    try {
        aiResponse = await askAI(messages);
    } 
    catch (err) {

        db.prepare(`
            INSERT INTO chats (thread_id, user_id, content, role)
            VALUES (?, ?, ?, 'assistant')
        `).run(threadId, userId, aiReject);
        
        return res.status(500).json({
            error: "AI request failed"
        });
    }

    // 5. Save AI reply

    db.prepare(`
      INSERT INTO chats (thread_id, user_id, content, role)
      VALUES (?, ?, ?, 'assistant')
    `).run(threadId, userId, aiResponse);

    //////////////////////////////////////////////////
    // 6. Return response
    //////////////////////////////////////////////////

    res.json({
      success: true,
      user_message: content,
      ai_response: aiResponse
    });
});

//////////////////// GET ALL CHATS ////////////////////


app.get("/api/thread/:thread_id/chats", isLoggedIn, isThreadOwner, (req, res) => {
    const userId = req.user.id;
    const threadId = req.params.thread_id;

    const chats = getChats(threadId, userId);

    res.status(200).json({success: true, chats});

});

////////////////////////////////////////
//////////////////// UPLOAD IMAGE 
////////////////////////////////////////

// import path from "path";

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "uploads/");
//   },
//   filename: (req, file, cb) => {
//     const uniqueName =
//       Date.now() + "-" + file.originalname.replace(/\s+/g, "");
//     cb(null, uniqueName);
//   }
// });

// export const upload = multer({ storage });

// const router = express.Router();


// router.post("/api/chat-image", 
//     upload.single("image"), // field name from FormData
//     async (req, res) => {

//     try {
//         const message = req.body.message;
//         const file = req.file;

//         if (!file) {
//             return res.status(400).json({
//                 success: false,
//                 error: "No image uploaded"
//             });
//         }

//         const imagePath = file.path;

//       // Call AI
//         const aiResponse = await analyzeImage(imagePath);

//         res.json({
//             success: true,
//             user_message: message,
//             ai_response: aiResponse,
//             image: imagePath
//         });
//     } 
//     catch (err) {
//         console.error(err);
//         res.status(500).json({
//             error: "Server error"
//         });
//     }
//   }
// );

// export default router;



// db.prepare(`
//   ALTER TABLE chats
//   ADD COLUMN image_path TEXT
// `).run();




//////////////////////////////////////////////////

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});