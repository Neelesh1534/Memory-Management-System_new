# MMSP — Advanced OS Memory Management Simulation Suite 🧠⚡

> **B.Tech Computer Science Capstone / OS PBL Project**  
> A high-performance Memory Management Platform featuring a native C simulation engine, Node.js bridge API, and an interactive dark-mode dashboard.

---

## 🌟 Overview

**MMSP** (Memory Management Simulation Platform) is an advanced educational and analytical tool designed to visualize, benchmark, and simulate Operating System memory management strategies in real time. It bridges low-level C memory allocation logic with a modern, high-throughput web front-end.

---

## 🚀 Key Features

### 📄 1. Page Replacement Simulator
Simulates virtual memory page swapping across **8 classic OS algorithms**:
- **FIFO** (First-In, First-Out)
- **LRU** (Least Recently Used)
- **Optimal (OPT)** (Theoretical minimum page fault benchmark)
- **Clock / Second Chance** (Circular buffer with Reference Bits)
- **LFU** (Least Frequently Used)
- **MFU** (Most Frequently Used)
- **MRU** (Most Recently Used)
- **Random Replacement**

**Interactive Components:**
- 📼 **Reference Stream Tape**: Visual step highlighter for page request queues.
- ⏯️ **Playback Controls**: Auto-play animation timer with 1x, 2x, and 5x speed multipliers.
- 🗂️ **Live Page Table**: Tracks Valid/Invalid status, Reference Bit, Dirty Bit, Last Access Timestamp, and Frequency Counters.
- 💻 **Physical RAM Matrix**: Color-coded 2D matrix displaying physical RAM frames with hit/fault glow effects.

---

### 🧩 2. Contiguous Partition Allocation
Simulates dynamic memory partitioning for process allocation:
- **First Fit**: Allocates to the first free partition block of sufficient size.
- **Best Fit**: Allocates to the smallest fitting block to minimize internal fragmentation.
- **Worst Fit**: Allocates to the largest available block.
- **Next Fit**: Searches circularly starting from the last allocated block location.

**Analytics:**
- Real-time calculation of **Internal Fragmentation**, **External Fragmentation**, and total allocated RAM.

---

### ⚔️ 3. Multi-Algorithm Benchmark & Belady's Anomaly Workbench
- **Side-by-Side Comparison**: Runs all 8 page replacement algorithms on the exact same page reference string to generate comparative bar charts using Chart.js.
- **Belady's Anomaly Tester**: Executes FIFO with 3 vs. 4 frames to test page fault anomalies on specific reference strings.

---

### 📘 4. OS Theory & Algorithmic Documentation
- Embedded time/space complexity matrices and hardware register requirement specifications.

---

## 🏗️ Architecture & Technology Stack

```
+-----------------------------------------------------------------------+
|                         Frontend Dashboard                            |
|       (Vanilla HTML5 / Modern Dark CSS3 Glassmorphism / JavaScript)   |
+-----------------------------------------------------------------------+
                                  |
                           HTTP POST /api/simulate
                                  v
+-----------------------------------------------------------------------+
|                         Node.js Express Bridge                        |
|                         (server.js - Port 3000)                       |
+-----------------------------------------------------------------------+
                                  |
                          IPC (stdio / spawn)
                                  v
+-----------------------------------------------------------------------+
|                        Compiled C Engine                              |
|               (mm_simulator.exe / memory_manager.c)                   |
+-----------------------------------------------------------------------+
```

| Layer | Technology |
| :--- | :--- |
| **Frontend** | HTML5, CSS3 (Glassmorphism + Dark Mode), JavaScript (ES6+), Chart.js |
| **Backend API** | Node.js, Express.js |
| **Simulation Core** | C (GCC Compiled), Standard IO JSON Serialization |

---

## 🛠️ Project Structure

```
mmsp/
├── backend/
│   ├── app.c               # C CLI wrapper & command handler
│   ├── memory_manager.c    # Core memory management algorithms implementation
│   ├── manager_manager.h   # C Header definitions & data structures
│   ├── mm_simulator.exe    # Compiled binary engine
│   ├── server.js           # Express API server bridge
│   ├── package.json        # Node.js dependencies
│   └── simulator_state.dat # Binary state persistence file
├── frontend/
│   ├── index.html          # Dashboard HTML structure
│   ├── style.css           # Capstone Dark Glassmorphic Design System
│   └── script.js           # Interactive controller & fallback engine
└── README.md               # Project documentation
```

---

## 💻 Installation & Setup

### Prerequisites
- **Node.js** (v14+ recommended)
- **GCC Compiler** (MinGW for Windows, or native GCC on Linux/macOS)

### 1. Clone the Repository
```bash
git clone https://github.com/Neelesh1534/Memory-Management-System.git
cd Memory-Management-System
```

### 2. Install Backend Dependencies
```bash
cd backend
npm install
```

### 3. Compile C Backend Binary (Optional if rebuild needed)
```bash
gcc -Wall -o mm_simulator.exe memory_manager.c app.c
```

### 4. Start the Application
```bash
npm start
# Server will launch on http://localhost:3000
```

### 5. Access the Web Dashboard
Open your browser and navigate to: **[http://localhost:3000](http://localhost:3000)**

---

## 📡 API Endpoint Reference

### `POST /api/simulate`
Executes C backend engine memory commands.

#### Request Body
```json
{
  "command": "STEP P1 0 FIFO"
}
```

#### Response Example
```json
{
  "ok": true,
  "message": "FIFO Algorithm: PAGE FAULT for P1, Page 0 (Assigned Frame 0)",
  "frame": 0,
  "action": "fault",
  "currentState": {
    "totalFrames": 64,
    "frameSizeKB": 64,
    "simulationStep": 1,
    "memory": [...],
    "processes": [...]
  }
}
```

---

## 📄 License
This project is licensed under the MIT License — free for educational and research use.
