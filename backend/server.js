// server.js (Node.js Bridge - Final Version)

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json()); // To parse JSON request bodies

// --- Configuration ---
const BACKEND_PATH = path.join(__dirname); // Now relative to server.js's location
const EXECUTABLE_NAME = 'mm_simulator.exe'; 
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend'); // Go up one level (..) then into frontend

// 1. Serve static frontend files (CSS, script.js, etc.)
// The key is the 'index' option here, which handles the "Cannot GET /" error.
app.use(express.static(FRONTEND_PATH, { 
    index: 'index.html' 
}));

// API Endpoint to handle all C commands
app.post('/api/simulate', (req, res) => {
    // Command format from JS: "INIT 1024 32" or "STEP P1 5 FIFO"
    const command = req.body.command;
    
    if (!command || command.length > 500) {
        return res.status(400).json({ error: 'Invalid command length.' });
    }

    // --- Start C Process ---
    // The executable path is now relative to the server.js file's location inside the 'backend' folder
    const simulator = spawn(path.join(BACKEND_PATH, EXECUTABLE_NAME), { 
        shell: false, 
        cwd: BACKEND_PATH // Set working directory for STATE_FILE persistence
    }); 
    
    let cOutput = '';
    let cError = '';

    simulator.stdout.on('data', (data) => {
        cOutput += data.toString();
    });

    simulator.stderr.on('data', (data) => {
        cError += data.toString();
    });

    // Send the command to the C program's standard input
    simulator.stdin.write(command + '\n');
    simulator.stdin.end();

    simulator.on('close', (code) => {
        if (code !== 0) {
            console.error(`C process exited with code ${code}. Error: ${cError}`);
            return res.status(500).json({ error: 'C backend error', details: cError || 'No details.' });
        }
        
        try {
            // Send the JSON output back to the frontend
            const jsonResponse = JSON.parse(cOutput.trim());
            res.json(jsonResponse);
        } catch (e) {
            console.error('Failed to parse C output as JSON:', cOutput);
            res.status(500).json({ error: 'Invalid JSON response from C backend', rawOutput: cOutput.trim() });
        }
    });
    
    simulator.on('error', (err) => {
        console.error('Failed to start C process:', err);
        res.status(500).json({ error: 'Failed to execute simulator executable.', details: err.message });
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Serving frontend from: ${FRONTEND_PATH}`);
});