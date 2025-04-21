const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL kapcsolat konfigurálása
const pool = new Pool({
    user: 'szotanulo_db_user', // Cseréld ki a Render által megadott felhasználónévre
    host: 'oregon-postgres.render.com', // Cseréld ki a Render által megadott hostra
    database: 'szotanulo_db',
    password: 'CsgZynA9EzCBMWsfgGbapeJ9luVdkNuR', // Cseréld ki a Render által megadott jelszóra
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

// Kapcsolat ellenőrzése
pool.connect((err) => {
    if (err) {
        console.error('Hiba az adatbázis kapcsolódásakor:', err.stack);
    } else {
        console.log('Sikeresen csatlakozva az adatbázishoz');
    }
});

// Paklik lekérése felhasználó alapján
app.get('/decks', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: 'Felhasználó azonosító szükséges!' });
    }
    try {
        const decksResult = await pool.query('SELECT name, words FROM decks WHERE user_id = $1', [userId]);
        const scoresResult = await pool.query('SELECT deck_name, score FROM best_scores WHERE user_id = $1', [userId]);
        
        const decksObj = {};
        const bestScoresObj = {};
        decksResult.rows.forEach(row => {
            decksObj[row.name] = row.words;
        });
        scoresResult.rows.forEach(row => {
            bestScoresObj[row.deck_name] = row.score;
        });
        res.json({ decks: decksObj, bestScores: bestScoresObj });
    } catch (error) {
        console.error('Hiba a paklik lekérésekor:', error);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

// Új pakli létrehozása
app.post('/decks', async (req, res) => {
    const { userId, name } = req.body;
    if (!userId || !name) {
        return res.status(400).json({ error: 'Felhasználó azonosító és pakli név szükséges!' });
    }
    try {
        const existingDeck = await pool.query('SELECT 1 FROM decks WHERE user_id = $1 AND name = $2', [userId, name]);
        if (existingDeck.rowCount > 0) {
            return res.status(400).json({ error: 'A pakli már létezik ennél a felhasználónál!' });
        }
        await pool.query('INSERT INTO decks (user_id, name, words) VALUES ($1, $2, $3)', [userId, name, '[]']);
        res.status(200).json({ message: 'Pakli létrehozva!' });
    } catch (error) {
        console.error('Hiba a pakli létrehozásakor:', error);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

// Szó hozzáadása egy paklihoz
app.post('/words', async (req, res) => {
    const { userId, deckName, hungarian, german } = req.body;
    if (!userId || !deckName || !hungarian || !german) {
        return res.status(400).json({ error: 'Minden mező kitöltése kötelező!' });
    }
    try {
        let deckResult = await pool.query('SELECT words FROM decks WHERE user_id = $1 AND name = $2', [userId, deckName]);
        let words;
        if (deckResult.rowCount === 0) {
            await pool.query('INSERT INTO decks (user_id, name, words) VALUES ($1, $2, $3)', [userId, deckName, '[]']);
            words = [];
        } else {
            words = deckResult.rows[0].words;
        }
        words.push({ hungarian, german });
        await pool.query('UPDATE decks SET words = $1 WHERE user_id = $2 AND name = $3', [JSON.stringify(words), userId, deckName]);
        res.status(200).json({ message: 'Szó hozzáadva!' });
    } catch (error) {
        console.error('Hiba a szó hozzáadásakor:', error);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

// Pakli törlése
app.delete('/decks/:deckName', async (req, res) => {
    const userId = req.query.userId;
    const deckName = req.params.deckName;
    if (!userId || !deckName) {
        return res.status(400).json({ error: 'Felhasználó azonosító és pakli név szükséges!' });
    }
    try {
        await pool.query('DELETE FROM decks WHERE user_id = $1 AND name = $2', [userId, deckName]);
        await pool.query('DELETE FROM best_scores WHERE user_id = $1 AND deck_name = $2', [userId, deckName]);
        res.status(200).json({ message: 'Pakli törölve!' });
    } catch (error) {
        console.error('Hiba a pakli törlésekor:', error);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

// Pontszám mentése
app.post('/scores', async (req, res) => {
    const { userId, deckName, score } = req.body;
    if (!userId || !deckName || score === undefined) {
        return res.status(400).json({ error: 'Felhasználó azonosító, pakli név és pontszám szükséges!' });
    }
    try {
        const existingScore = await pool.query('SELECT 1 FROM best_scores WHERE user_id = $1 AND deck_name = $2', [userId, deckName]);
        if (existingScore.rowCount > 0) {
            await pool.query('UPDATE best_scores SET score = $1 WHERE user_id = $2 AND deck_name = $3', [score, userId, deckName]);
        } else {
            await pool.query('INSERT INTO best_scores (user_id, deck_name, score) VALUES ($1, $2, $3)', [userId, deckName, score]);
        }
        res.status(200).json({ message: 'Pontszám mentve!' });
    } catch (error) {
        console.error('Hiba a pontszám mentésekor:', error);
        res.status(500).json({ error: 'Szerver hiba' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Szerver fut a ${PORT} porton`);
});
