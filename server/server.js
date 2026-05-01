/**
 * ============================================================================
 *  🐍 Snake Leaderboard Server
 *  Node.js + Express + better-sqlite3
 *
 *  Endpoints:
 *    POST /api/score      — Submit a score  { playerName, score }
 *    GET  /api/leaderboard — Get Top 10 scores
 * ============================================================================
 */
const express = require('express');
const cors    = require('cors');
const Database = require('better-sqlite3');
const path    = require('path');

// ---- App setup ----
const app  = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware ----
app.use(cors());                    // Allow all origins (for dev)
app.use(express.json());            // Parse JSON request body

// ---- Database ----
const db = new Database(path.join(__dirname, 'leaderboard.db'));

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');

// Create scores table if not exists
db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT    NOT NULL,
        score      INTEGER NOT NULL CHECK(score >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// ---- API Routes ----

/**
 * POST /api/score
 * Submit a new score.
 * Body: { playerName: string (3-10 chars, alphanumeric + underscore), score: number }
 */
app.post('/api/score', (req, res) => {
    try {
        const { playerName, score } = req.body;

        // --- Validation ---
        if (!playerName || typeof playerName !== 'string') {
            return res.status(400).json({ error: 'playerName is required and must be a string' });
        }
        if (!/^[a-zA-Z0-9_]{3,10}$/.test(playerName)) {
            return res.status(400).json({
                error: 'playerName must be 3-10 characters (letters, digits, underscores)',
            });
        }
        const scoreNum = parseInt(score, 10);
        if (isNaN(scoreNum) || scoreNum < 0) {
            return res.status(400).json({ error: 'score must be a non-negative integer' });
        }

        // --- Insert ---
        const stmt = db.prepare('INSERT INTO scores (player_name, score) VALUES (?, ?)');
        const result = stmt.run(playerName, scoreNum);

        return res.status(201).json({
            id: result.lastInsertRowid,
            playerName,
            score: scoreNum,
        });
    } catch (err) {
        console.error('POST /api/score error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/leaderboard
 * Return Top 10 highest scores, ordered by score descending,
 * then by submission time ascending (earlier first if tied).
 */
app.get('/api/leaderboard', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT id, player_name, score, created_at
            FROM scores
            ORDER BY score DESC, created_at ASC
            LIMIT 10
        `).all();

        const leaderboard = rows.map((row, index) => ({
            rank:       index + 1,
            id:         row.id,
            playerName: row.player_name,
            score:      row.score,
            createdAt:  row.created_at,
        }));

        return res.json(leaderboard);
    } catch (err) {
        console.error('GET /api/leaderboard error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ---- Health check ----
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Start server ----
app.listen(PORT, () => {
    console.log(`🐍 Snake leaderboard server running at http://localhost:${PORT}`);
    console.log(`   POST /api/score     — Submit a score`);
    console.log(`   GET  /api/leaderboard — Top 10 leaderboard`);
});
