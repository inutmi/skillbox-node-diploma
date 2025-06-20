require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const nunjucks = require("nunjucks");
const { MongoClient } = require("mongodb");

const app = express();

const clientPromise = MongoClient.connect(process.env.DB_URI, { maxPoolSize: 10 });

// Настройки шаблонизатора
nunjucks.configure("views", { autoescape: true, express: app });
app.set("view engine", "njk");

app.use(express.json());
app.use(express.static("public"));
app.use(cookieParser());

// Подключаем базу к каждому запросу
app.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    req.db = client.db(process.env.DB_NAME);
    next();
  } catch (err) {
    next(err);
  }
});

// Подключение маршрутов пользователей
app.use("/", require("./users"));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
