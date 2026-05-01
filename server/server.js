/**
 * ============================================================================
 *  🐍 Snake Leaderboard Server
 *  Node.js + Express + sql.js (pure-JS SQLite, no native compilation needed)
 *
 *  Endpoints:
 *    POST /api/score       — Submit a score  { playerName, score }
 *    GET  /api/leaderboard  — Get Top 10 scores
 *    GET  /api/health       — Health check
 * ============================================================================
 */
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const initSqlJs = require('sql.js');

// ---- App setup ----
const app     = express();
const PORT    = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'leaderboard.db');

// ---- Middleware ----
app.use(cors());                  // Allow all origins (for dev)
app.use(express.json());          // Parse JSON request body

// ---- Database (sql.js) ----
let db = null;

/**
 * Initialise database:
 *  1. Load sql.js WASM module
 *  2. If a .db file exists on disk, load from it (persistence across restarts)
 *  3. Otherwise create a fresh in-memory database
 *  4. Ensure the scores table exists
 *  5. Write the initial state to disk
 */
async function initDb() {
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('  Loaded existing database from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('  Created new in-memory database');
    }

    // Enable WAL-like durability by running pragmas
    db.run('PRAGMA journal_mode = MEMORY');

    // Create scores table if not exists
    db.run(`
        CREATE TABLE IF NOT EXISTS scores (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT    NOT NULL,
            score       INTEGER NOT NULL CHECK(score >= 0),
            created_at  DATETIME DEFAULT (datetime('now'))
        )
    `);

    // Persist to disk so the file exists on first run
    persistDb();
}

/** Write the current DB state to disk */
function persistDb() {
    const data = db.export();              // returns Uint8Array
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ---- Helper: run a parameterised query & return all result rows as objects ----
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// ---- Helper: run a single INSERT/UPDATE/DELETE, return lastInsertRowid ----
function runInsert(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    stmt.run();
    // Retrieve the last inserted rowid
    const row = queryAll('SELECT last_insert_rowid() AS id')[0];
    stmt.free();
    return row ? row.id : null;
}

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
        const id = runInsert(
            'INSERT INTO scores (player_name, score) VALUES (?, ?)',
            [playerName, scoreNum]
        );

        // Persist to disk after each write
        persistDb();

        return res.status(201).json({
            id,
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
        const rows = queryAll(`
            SELECT id, player_name, score, created_at
            FROM scores
            ORDER BY score DESC, created_at ASC
            LIMIT 10
        `);

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
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`🐍 Snake leaderboard server running at http://localhost:${PORT}`);
        console.log(`   POST /api/score       — Submit a score`);
        console.log(`   GET  /api/leaderboard  — Top 10 leaderboard`);
        console.log(`   Database file: ${DB_PATH}`);
    });
}).catch(err => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
});
