const express = require("express");
const bodyParser = require("body-parser");
const { ObjectId } = require("mongodb");
const  marked  = require("marked");
const createDomPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const router = express.Router();
const dompurify = createDomPurify(new JSDOM().window);

const LIMITARRAY = 20;





// Вспомогательные функции, дублируем или импортируем
const chunk = (array, chunkSize) => {
  const size = Math.ceil(array.length / chunkSize);
  const chunks = new Array(size).fill(0);
  return chunks.map((_, index) => array.slice(index * chunkSize, (index + 1) * chunkSize));
};

const { pbkdf2Sync } = require("crypto");
const hash = (d) => pbkdf2Sync(d, "salt", 100000, 64, "sha512").toString("hex");

const getStartingMonth = (v) => {
  const d = new Date();
  const month = Number(v[0]);
  d.setDate(d.getDay() - 1);
  return d.setMonth(d.getMonth() - month);
};

// DB функции
const {
  createUser,
  findUserByUsername,
  findUserBySessionId,
  createSession,
  deleteSesion,
  createNote,
  findNote,
  findNoteCustomId,
  findNotesByUserId,
  updateNote,
  deleteNote,
  deleteNoteAll,
} = require("./db"); // если захотите, можно вынести и их отдельно

// Middleware для авторизации
const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) return next();
  const user = await findUserBySessionId(req.db, req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

// ROUTES
router.get("/", auth(), (req, res) => {
  if (req.user) return res.redirect("/dashboard");
  res.render("index", { authError: req.query.authError });
});

router.get("/dashboard", auth(), (req, res) => {
  if (!req.user) return res.redirect("/");
  res.render("dashboard", { user: req.user });
});

router.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(req.db, username);
  if (!user) return res.redirect("/?authError=Unknown%20username");
  if (user.passwordHash !== hash(password)) return res.redirect("/?authError=Wrong%20password");

  const sessionId = await createSession(req.db, user._id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

router.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const existingUser = await findUserByUsername(req.db, username);
  if (existingUser) return res.redirect("/?authError=The%20user%20is%20already%20registered");

  const newUser = await createUser(req.db, username, password);
  const sessionId = await createSession(req.db, newUser.insertedId);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
});

router.get("/logout", auth(), async (req, res) => {
  if (!req.user) return res.redirect("/");
  await deleteSesion(req.db, req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

router.get("/api/notes", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);

  let archive = false;
  let age = "1970-01-01";
  let hasMore = false;

  if (req.query.age === "archive") archive = true;
  if (req.query.age === "1month" || req.query.age === "3months") age = getStartingMonth(req.query.age);

  let array = await findNotesByUserId(req.db, "notes", req.user._id, archive, age);

  if (array.length > LIMITARRAY) {
    const pages = chunk(array, LIMITARRAY);
    array = pages[Number(req.query.page) - 1];
    if (pages.length > req.query.page) hasMore = true;
  }

  res.json({ data: array, hasMore });
});

router.get("/api/note/:id", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  const note = await findNoteCustomId(req.db, "notes", new ObjectId(req.params.id));
  res.json(note);
});

router.post("/api/notes", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  const note = {
    created: new Date(),
    title: req.body.title,
    text: req.body.text,
    userId: req.user._id,
    isArchived: false,
    html: dompurify.sanitize(marked(req.body.text)),
  };

  try {
    const result = await createNote(req.db, "notes", note);
    const insertedNote = await findNote(req.db, "notes", result.insertedId);
    res.json({ _id: insertedNote._id.toString() });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: "An error occurred, please try again later." });
  }
});

router.post("/api/note/:id/edit", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);

  const data = {
    title: req.body.title,
    text: req.body.text,
    html: dompurify.sanitize(marked(req.body.text)),
  };

  try {
    const { modifiedCount } = await updateNote(req.db, new ObjectId(req.params.id), data);
    if (modifiedCount === 0) res.status(404).send(`Unknown user Id: ${req.params.id}`);
    else res.json({ _id: req.params.id });
  } catch (err) {
    res.send(err.message);
  }
});

router.post("/api/note/:id/archive", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const { modifiedCount } = await updateNote(req.db, new ObjectId(req.params.id), {
      isArchived: req.body.isArchived,
    });
    if (modifiedCount === 0) res.status(404).send(`Unknown user Id: ${req.params.id}`);
    else res.json({ _id: req.params.id });
  } catch (err) {
    res.send(err.message);
  }
});

router.delete("/api/note/:id", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    await deleteNote(req.db, "notes", new ObjectId(req.params.id));
    res.json({ _id: req.params.id });
  } catch (err) {
    res.send(err.message);
  }
});

router.delete("/api/note", auth(), async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    await deleteNoteAll(req.db, "notes", req.user._id);
    res.json({});
  } catch (err) {
    res.send(err.message);
  }
});

module.exports = router;
