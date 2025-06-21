require("dotenv").config();
const { MongoClient, ObjectId } = require("mongodb");
const { pbkdf2Sync } = require("crypto");
const { nanoid } = require("nanoid");

const client = new MongoClient(process.env.DB_URI, {
  maxPoolSize: 10,
});




const clientPromise = client.connect();

const getDb = async () => {
  const connectedClient = await clientPromise;
  return connectedClient.db(process.env.DB_NAME);
};

const hash = (d) => pbkdf2Sync(d, "salt", 100000, 64, "sha512").toString("hex");

// Пользователи
const createUser = async (db, userName, password) => {
  const passwordHash = hash(password);
  return db.collection("users").insertOne({ userName, passwordHash });
};

const findUserByUsername = async (db, userName) => {
  return db.collection("users").findOne({ userName });
};

const findUserBySessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne({ sessionId }, { projection: { userId: 1 } });
  if (!session) return null;
  return db.collection("users").findOne({ _id: session.userId });
};

const createSession = async (db, userId) => {
  const sessionId = nanoid();
  await db.collection("sessions").insertOne({ userId, sessionId });
  return sessionId;
};

const deleteSesion = async (db, sessionId) => {
  await db.collection("sessions").deleteOne({ sessionId });
};

// Заметки
const createNote = async (db, table, data) => {
  return db.collection(table).insertOne(data);
};

const findNote = async (db, table, noteId) => {
  return db.collection(table).findOne({ _id: noteId });
};

const findNoteCustomId = async (db, table, id) => {
  return db.collection(table).findOne({ _id: id });
};

const findNotesByUserId = async (db, table, userId, isArchived, age) => {
  return db
    .collection(table)
    .find({ userId, isArchived, created: { $gt: new Date(age) } })
    .sort({ created: -1 })
    .toArray();
};

const updateNote = async (db, id, data) => {
  return db.collection("notes").updateOne({ _id: id }, { $set: data });
};

const deleteNote = async (db, table, id) => {
  return db.collection(table).deleteOne({ _id: id });
};

const deleteNoteAll = async (db, table, userId) => {
  return db.collection(table).deleteMany({ userId, isArchived: true });
};

module.exports = {
  clientPromise,
  getDb,
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
  ObjectId, // экспорт ObjectId для использования в других модулях
};
