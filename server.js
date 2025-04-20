const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL kapcsolat beállítása
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Adatbázis táblák létrehozása
pool.query(`
    CREATE TABLE IF NOT EXISTS decks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        deck_id INTEGER REFERENCES decks(id),
        hungarian TEXT NOT NULL,
        german TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        deck_id INTEGER REFERENCES decks(id),
        score REAL NOT NULL
    );
`, (err) => {
    if (err) {
        console.error('Hiba a táblák létrehozásakor:', err);
    } else {
        console.log('Adatbázis táblák létrehozva vagy már léteznek.');
    }
});

// API végpontok
// Összes pakli lekérdezése
app.get('/decks', async (req, res) => {
    try {
        const decksResult = await pool.query(`
            SELECT decks.id, decks.name, MAX(scores.score) as best_score
            FROM decks
            LEFT JOIN scores ON decks.id = scores.deck_id
            GROUP BY decks.id, decks.name
        `);
        const wordsResult = await pool.query(`
            SELECT decks.name, words.hungarian, words.german
            FROM words
            JOIN decks ON words.deck_id = decks.id
        `);

        const decks = {};
        const bestScores = {};
        decksResult.rows.forEach(row => {
            decks[row.name] = [];
            bestScores[row.name] = row.best_score || 0;
        });

        wordsResult.rows.forEach(row => {
            decks[row.name].push({ hungarian: row.hungarian, german: row.german });
        });

        res.json({ decks, bestScores });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Új pakli létrehozása
app.post('/decks', async (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'A pakli neve kötelező!' });
    }

    try {
        const result = await pool.query('INSERT INTO decks (name) VALUES ($1) RETURNING *', [name]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ez a pakli név már létezik!' });
    }
});

// Szavak hozzáadása egy paklihoz
app.post('/words', async (req, res) => {
    const { deckName, hungarian, german } = req.body;
    if (!deckName || !hungarian || !german) {
        return res.status(400).json({ error: 'Minden mező kötelező!' });
    }

    try {
        const deckResult = await pool.query('SELECT id FROM decks WHERE name = $1', [deckName]);
        if (deckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pakli nem található!' });
        }
        const deckId = deckResult.rows[0].id;

        const result = await pool.query(
            'INSERT INTO words (deck_id, hungarian, german) VALUES ($1, $2, $3) RETURNING *',
            [deckId, hungarian, german]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eredmény mentése
app.post('/scores', async (req, res) => {
    const { deckName, score } = req.body;
    if (!deckName || score === undefined) {
        return res.status(400).json({ error: 'Minden mező kötelező!' });
    }

    try {
        const deckResult = await pool.query('SELECT id FROM decks WHERE name = $1', [deckName]);
        if (deckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pakli nem található!' });
        }
        const deckId = deckResult.rows[0].id;

        const result = await pool.query(
            'INSERT INTO scores (deck_id, score) VALUES ($1, $2) RETURNING *',
            [deckId, score]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pakli törlése
app.delete('/decks/:name', async (req, res) => {
    const { name } = req.params;

    try {
        const deckResult = await pool.query('SELECT id FROM decks WHERE name = $1', [name]);
        if (deckResult.rows.length === 0) {
            return res.status(404).json({ error: 'Pakli nem található!' });
        }
        const deckId = deckResult.rows[0].id;

        await pool.query('DELETE FROM words WHERE deck_id = $1', [deckId]);
        await pool.query('DELETE FROM scores WHERE deck_id = $1', [deckId]);
        await pool.query('DELETE FROM decks WHERE id = $1', [deckId]);

        res.status(200).json({ message: 'Pakli törölve!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Szerver indítása
app.listen(port, () => {
    console.log(`Szerver fut a ${port} porton`);
});