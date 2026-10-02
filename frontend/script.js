// script.js — Advanced OS Memory Management Controller

// State Management
let systemConfig = {
    totalMemory: 4096,
    frameSize: 64,
    algorithm: 'FIFO',
    refString: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
};

let simState = {
    stepIndex: 0,
    history: [],
    isPlaying: false,
    timer: null,
    playSpeed: 1000,
    totalFrames: 64,
    memory: [], // [{ processId, pageId, loadTime, lastAccessTime, accessCount, refBit, dirtyBit }]
    processes: [], // [{ id, pageCount, faults, hits, pages: [] }]
    logs: [],
    contiguousBlocks: []
};

// DOM Cache
const dom = {
    tabs: document.querySelectorAll('.nav-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    globalStatus: document.getElementById('global-status-message'),
    
    totalMemory: document.getElementById('totalMemory'),
    frameSize: document.getElementById('frameSize'),
    algorithm: document.getElementById('algorithm'),
    refStringInput: document.getElementById('refStringInput'),
    genRandomRef: document.getElementById('gen-random-ref'),
    
    initBtn: document.getElementById('init-btn'),
    uploadTriggerBtn: document.getElementById('upload-trigger-btn'),
    fileInput: document.getElementById('file-input'),
    
    refTape: document.getElementById('ref-tape'),
    prevStepBtn: document.getElementById('prev-step-btn'),
    playPauseBtn: document.getElementById('play-pause-btn'),
    stepBtn: document.getElementById('step-btn'),
    resetBtn: document.getElementById('reset-btn'),
    playSpeed: document.getElementById('play-speed'),
    
    faults: document.getElementById('faults'),
    hits: document.getElementById('hits'),
    hitRatio: document.getElementById('hit-ratio'),
    simStepCount: document.getElementById('sim-step-count'),
    
    pageTableBody: document.querySelector('#page-table tbody'),
    memoryGrid: document.getElementById('memory-grid'),
    logList: document.getElementById('log'),
    
    // Contiguous Allocation
    allocProcId: document.getElementById('alloc-process-id'),
    allocSize: document.getElementById('alloc-size'),
    allocAlgo: document.getElementById('alloc-algorithm'),
    allocateBtn: document.getElementById('allocate-btn'),
    deallocateBtn: document.getElementById('deallocate-btn'),
    resetContiguousBtn: document.getElementById('reset-contiguous-btn'),
    partitionContainer: document.getElementById('partition-visualization'),
    internalFragVal: document.getElementById('internal-frag-val'),
    externalFragVal: document.getElementById('external-frag-val'),
    allocatedSpaceVal: document.getElementById('allocated-space-val'),
    
    // Benchmarks
    runBenchmarkBtn: document.getElementById('run-benchmark-btn'),
    testBeladyBtn: document.getElementById('test-belady-btn'),
    benchmarkTableBody: document.getElementById('benchmark-table-body'),
    chartCanvas: document.getElementById('benchmarkChart')
};

let benchmarkChartInstance = null;

// Initialize Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initTabNavigation();
    initEventListeners();
    initContiguousPartitions();
    parseRefString();
});

// --- Tab Navigation ---
function initTabNavigation() {
    dom.tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            dom.tabs.forEach(t => t.classList.remove('active'));
            dom.tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');
        });
    });
}

// --- Event Listeners ---
function initEventListeners() {
    dom.genRandomRef.addEventListener('click', generateRandomRefString);
    dom.initBtn.addEventListener('click', initializeSimulation);
    dom.stepBtn.addEventListener('click', stepSimulation);
    dom.prevStepBtn.addEventListener('click', prevStepSimulation);
    dom.playPauseBtn.addEventListener('click', togglePlayPause);
    dom.resetBtn.addEventListener('click', resetSimulation);
    dom.playSpeed.addEventListener('change', (e) => {
        simState.playSpeed = parseInt(e.target.value, 10);
        if (simState.isPlaying) {
            togglePlayPause();
            togglePlayPause();
        }
    });

    dom.uploadTriggerBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', handleFileUpload);

    // Contiguous Allocator Listeners
    dom.allocateBtn.addEventListener('click', handleContiguousAllocate);
    dom.deallocateBtn.addEventListener('click', handleContiguousDeallocate);
    dom.resetContiguousBtn.addEventListener('click', initContiguousPartitions);

    // Benchmark Listeners
    dom.runBenchmarkBtn.addEventListener('click', runBenchmarkSuite);
    dom.testBeladyBtn.addEventListener('click', testBeladyAnomaly);
}

// --- Reference String Helper ---
function parseRefString() {
    const raw = dom.refStringInput.value.trim();
    if (!raw) return [];
    const arr = raw.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
    systemConfig.refString = arr;
    return arr;
}

function generateRandomRefString() {
    const len = 20;
    const arr = [];
    for (let i = 0; i < len; i++) {
        arr.push(Math.floor(Math.random() * 8));
    }
    dom.refStringInput.value = arr.join(', ');
    parseRefString();
    showStatus('Generated new random page reference sequence.', 'info');
}

// --- File Upload Simulator ---
function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;
    
    let refSeq = [];
    Array.from(files).forEach((f, idx) => {
        const pages = Math.max(1, Math.ceil(f.size / (systemConfig.frameSize * 1024)));
        for (let p = 0; p < pages; p++) {
            refSeq.push(p);
        }
    });

    dom.refStringInput.value = refSeq.join(', ');
    parseRefString();
    showStatus(`Uploaded ${files.length} file(s) and built process page reference sequence (${refSeq.length} page requests).`, 'info');
}

// --- API Backend Bridge ---
async function callCBackend(command) {
    try {
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        return data;
    } catch (err) {
        console.warn('Backend C service unavailable, falling back to local JS simulation engine.', err);
        return null;
    }
}

// --- Simulation Core ---
async function initializeSimulation() {
    systemConfig.totalMemory = parseInt(dom.totalMemory.value, 10) || 4096;
    systemConfig.frameSize = parseInt(dom.frameSize.value, 10) || 64;
    systemConfig.algorithm = dom.algorithm.value;
    parseRefString();

    if (!systemConfig.refString.length) {
        showStatus('Please provide a valid page reference string.', 'error');
        return;
    }

    simState.totalFrames = Math.floor(systemConfig.totalMemory / systemConfig.frameSize);
    simState.stepIndex = 0;
    simState.history = [];
    simState.memory = new Array(simState.totalFrames).fill(null).map(() => ({
        processId: '',
        pageId: -1,
        loadTime: -1,
        lastAccessTime: -1,
        accessCount: 0,
        refBit: 0,
        dirtyBit: 0
    }));
    
    simState.processes = [{
        id: 'P1',
        pageCount: Math.max(...systemConfig.refString) + 1,
        faults: 0,
        hits: 0,
        pages: new Array(Math.max(...systemConfig.refString) + 1).fill(-1)
    }];

    simState.logs = [`System initialized with ${simState.totalFrames} physical frames using ${systemConfig.algorithm} algorithm.`];

    // Try calling C engine INIT
    await callCBackend(`INIT ${systemConfig.totalMemory} ${systemConfig.frameSize}`);

    // Enable Controls
    dom.stepBtn.disabled = false;
    dom.playPauseBtn.disabled = false;
    dom.resetBtn.disabled = false;

    renderRefTape();
    renderUI();
    showStatus(`System initialized. Physical frames: ${simState.totalFrames}. Click Next Step or Auto Play.`, 'info');
}

async function stepSimulation() {
    if (simState.stepIndex >= systemConfig.refString.length) {
        if (simState.isPlaying) togglePlayPause();
        showStatus('Simulation complete! All page references executed.', 'info');
        return;
    }

    // Save history snapshot for prev step
    simState.history.push(JSON.parse(JSON.stringify({
        stepIndex: simState.stepIndex,
        memory: simState.memory,
        processes: simState.processes,
        logs: simState.logs
    })));

    dom.prevStepBtn.disabled = false;
    const reqPage = systemConfig.refString[simState.stepIndex];
    const proc = simState.processes[0];
    const algo = systemConfig.algorithm;

    // Call C backend or fallback
    const backendRes = await callCBackend(`STEP P1 ${reqPage} ${algo}`);
    
    let isHit = false;
    let frameIdx = -1;

    if (backendRes && backendRes.ok && backendRes.currentState) {
        // Sync from C engine
        simState.memory = backendRes.currentState.memory;
        simState.processes = backendRes.currentState.processes;
        frameIdx = backendRes.frame;
        isHit = (backendRes.action === 'hit');
    } else {
        // Run Local JS Simulation Engine
        const res = runLocalStep(algo, 'P1', reqPage);
        frameIdx = res.frameIndex;
        isHit = res.isHit;
    }

    const logEntry = `Step ${simState.stepIndex + 1}: Page ${reqPage} -> ${isHit ? 'HIT (Frame ' + frameIdx + ')' : 'PAGE FAULT (Loaded to Frame ' + frameIdx + ')'}`;
    simState.logs.unshift(logEntry);

    simState.stepIndex++;
    renderRefTape();
    renderUI(frameIdx, isHit);

    if (simState.stepIndex >= systemConfig.refString.length && simState.isPlaying) {
        togglePlayPause();
        showStatus('Simulation complete!', 'info');
    }
}

function prevStepSimulation() {
    if (!simState.history.length) return;
    const lastState = simState.history.pop();
    simState.stepIndex = lastState.stepIndex;
    simState.memory = lastState.memory;
    simState.processes = lastState.processes;
    simState.logs = lastState.logs;

    if (!simState.history.length) dom.prevStepBtn.disabled = true;

    renderRefTape();
    renderUI();
}

function togglePlayPause() {
    if (simState.isPlaying) {
        clearInterval(simState.timer);
        simState.isPlaying = false;
        dom.playPauseBtn.innerHTML = '<i class="fas fa-play"></i> Auto Play';
        dom.playPauseBtn.classList.remove('danger-btn');
    } else {
        simState.isPlaying = true;
        dom.playPauseBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
        dom.playPauseBtn.classList.add('danger-btn');
        simState.timer = setInterval(stepSimulation, simState.playSpeed);
    }
}

function resetSimulation() {
    if (simState.isPlaying) togglePlayPause();
    initializeSimulation();
}

// --- Local JS Execution Fallback Engine ---
function runLocalStep(algo, procId, reqPage) {
    const proc = simState.processes[0];
    let frameIdx = proc.pages[reqPage];
    let isHit = false;

    if (frameIdx !== undefined && frameIdx !== -1 && simState.memory[frameIdx] && simState.memory[frameIdx].pageId === reqPage) {
        // HIT
        isHit = true;
        proc.hits++;
        simState.memory[frameIdx].lastAccessTime = simState.stepIndex;
        simState.memory[frameIdx].accessCount++;
        simState.memory[frameIdx].refBit = 1;
    } else {
        // FAULT
        isHit = false;
        proc.faults++;
        
        // Find free frame
        let victimFrame = simState.memory.findIndex(f => f.pageId === -1 || !f.processId);
        
        if (victimFrame === -1) {
            // Eviction Algorithm Selection
            if (algo === 'LRU') {
                let oldest = Infinity;
                simState.memory.forEach((f, idx) => {
                    if (f.lastAccessTime < oldest) { oldest = f.lastAccessTime; victimFrame = idx; }
                });
            } else if (algo === 'LFU') {
                let minFreq = Infinity;
                simState.memory.forEach((f, idx) => {
                    if (f.accessCount < minFreq) { minFreq = f.accessCount; victimFrame = idx; }
                });
            } else if (algo === 'MFU') {
                let maxFreq = -1;
                simState.memory.forEach((f, idx) => {
                    if (f.accessCount > maxFreq) { maxFreq = f.accessCount; victimFrame = idx; }
                });
            } else if (algo === 'MRU') {
                let newest = -1;
                simState.memory.forEach((f, idx) => {
                    if (f.lastAccessTime > newest) { newest = f.lastAccessTime; victimFrame = idx; }
                });
            } else if (algo === 'CLOCK') {
                let hand = (simState.stepIndex) % simState.totalFrames;
                for (let i = 0; i < simState.totalFrames * 2; i++) {
                    let idx = (hand + i) % simState.totalFrames;
                    if (simState.memory[idx].refBit === 0) { victimFrame = idx; break; }
                    else { simState.memory[idx].refBit = 0; }
                }
                if (victimFrame === -1) victimFrame = 0;
            } else if (algo === 'OPTIMAL') {
                let farthest = -1;
                simState.memory.forEach((f, idx) => {
                    let nextUse = Infinity;
                    for (let k = simState.stepIndex + 1; k < systemConfig.refString.length; k++) {
                        if (systemConfig.refString[k] === f.pageId) { nextUse = k; break; }
                    }
                    if (nextUse > farthest) { farthest = nextUse; victimFrame = idx; }
                });
            } else if (algo === 'RANDOM') {
                victimFrame = Math.floor(Math.random() * simState.totalFrames);
            } else { // FIFO
                let oldestLoad = Infinity;
                simState.memory.forEach((f, idx) => {
                    if (f.loadTime < oldestLoad) { oldestLoad = f.loadTime; victimFrame = idx; }
                });
            }
        }

        // Perform Eviction
        if (simState.memory[victimFrame] && simState.memory[victimFrame].pageId !== -1) {
            const evictedPage = simState.memory[victimFrame].pageId;
            proc.pages[evictedPage] = -1;
        }

        frameIdx = victimFrame;
        proc.pages[reqPage] = frameIdx;
        simState.memory[frameIdx] = {
            processId: procId,
            pageId: reqPage,
            loadTime: simState.stepIndex,
            lastAccessTime: simState.stepIndex,
            accessCount: 1,
            refBit: 1,
            dirtyBit: Math.random() > 0.5 ? 1 : 0
        };
    }

    return { frameIndex: frameIdx, isHit };
}

// --- UI Renderers ---
function renderRefTape() {
    dom.refTape.innerHTML = '';
    systemConfig.refString.forEach((page, idx) => {
        const div = document.createElement('div');
        div.className = 'tape-cell';
        div.textContent = page;
        if (idx === simState.stepIndex - 1) {
            div.classList.add('active-step');
        }
        dom.refTape.appendChild(div);
    });
}

function renderUI(highlightFrame = -1, isHit = false) {
    const proc = simState.processes[0] || { faults: 0, hits: 0, pageCount: 0, pages: [] };
    const totalRequests = proc.faults + proc.hits;
    const ratio = totalRequests > 0 ? ((proc.hits / totalRequests) * 100).toFixed(1) : 0;

    dom.faults.textContent = proc.faults;
    dom.hits.textContent = proc.hits;
    dom.hitRatio.textContent = `${ratio}%`;
    dom.simStepCount.textContent = simState.stepIndex;

    // Render RAM Matrix
    dom.memoryGrid.innerHTML = '';
    simState.memory.forEach((frame, idx) => {
        const div = document.createElement('div');
        div.className = 'ram-frame';
        if (frame.pageId !== -1 && frame.processId) div.classList.add('allocated');
        if (idx === highlightFrame) {
            div.classList.add(isHit ? 'hit-anim' : 'fault-anim');
        }

        div.innerHTML = `
            <div class="frame-num">Frame ${idx}</div>
            <div class="frame-info">
                <div class="proc-tag">${frame.processId || 'FREE'}</div>
                <div class="page-tag">${frame.pageId !== -1 ? 'Page ' + frame.pageId : ''}</div>
            </div>
        `;
        dom.memoryGrid.appendChild(div);
    });

    // Render Page Table
    dom.pageTableBody.innerHTML = '';
    for (let p = 0; p < proc.pageCount; p++) {
        const frameIdx = proc.pages[p] !== undefined ? proc.pages[p] : -1;
        const mappedFrame = (frameIdx !== -1 && simState.memory[frameIdx]) ? simState.memory[frameIdx] : null;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>Page ${p}</td>
            <td>${frameIdx !== -1 ? 'Frame ' + frameIdx : '<span style="color:var(--text-dim)">Unmapped</span>'}</td>
            <td>${frameIdx !== -1 ? '<span class="badge-hit">VALID</span>' : '<span class="badge-fault">INVALID</span>'}</td>
            <td>${mappedFrame ? mappedFrame.refBit : 0}</td>
            <td>${mappedFrame ? mappedFrame.dirtyBit : 0}</td>
            <td>${mappedFrame ? mappedFrame.accessCount : 0}</td>
        `;
        dom.pageTableBody.appendChild(tr);
    }

    // Render Logs
    dom.logList.innerHTML = simState.logs.map(log => {
        let cls = 'info-log';
        if (log.includes('HIT')) cls = 'hit-log';
        if (log.includes('FAULT')) cls = 'fault-log';
        return `<li class="${cls}">${log}</li>`;
    }).join('');
}

// --- Contiguous Partition Allocation Module ---
function initContiguousPartitions() {
    simState.contiguousBlocks = [
        { id: 0, sizeKB: 512, processId: '', isAllocated: false, internalFrag: 0 },
        { id: 1, sizeKB: 256, processId: '', isAllocated: false, internalFrag: 0 },
        { id: 2, sizeKB: 1024, processId: '', isAllocated: false, internalFrag: 0 },
        { id: 3, sizeKB: 512, processId: '', isAllocated: false, internalFrag: 0 },
        { id: 4, sizeKB: 768, processId: '', isAllocated: false, internalFrag: 0 },
        { id: 5, sizeKB: 1024, processId: '', isAllocated: false, internalFrag: 0 }
    ];
    renderContiguousPartitions();
}

function handleContiguousAllocate() {
    const procId = dom.allocProcId.value.trim() || 'P_X';
    const reqSize = parseInt(dom.allocSize.value, 10) || 256;
    const algo = dom.allocAlgo.value;

    let chosenIdx = -1;

    if (algo === 'FIRST_FIT') {
        chosenIdx = simState.contiguousBlocks.findIndex(b => !b.isAllocated && b.sizeKB >= reqSize);
    } else if (algo === 'BEST_FIT') {
        let minSize = Infinity;
        simState.contiguousBlocks.forEach((b, idx) => {
            if (!b.isAllocated && b.sizeKB >= reqSize && b.sizeKB < minSize) {
                minSize = b.sizeKB;
                chosenIdx = idx;
            }
        });
    } else if (algo === 'WORST_FIT') {
        let maxSize = -1;
        simState.contiguousBlocks.forEach((b, idx) => {
            if (!b.isAllocated && b.sizeKB >= reqSize && b.sizeKB > maxSize) {
                maxSize = b.sizeKB;
                chosenIdx = idx;
            }
        });
    } else if (algo === 'NEXT_FIT') {
        chosenIdx = simState.contiguousBlocks.findIndex(b => !b.isAllocated && b.sizeKB >= reqSize);
    }

    if (chosenIdx !== -1) {
        const blk = simState.contiguousBlocks[chosenIdx];
        blk.isAllocated = true;
        blk.processId = procId;
        blk.internalFrag = blk.sizeKB - reqSize;
        showStatus(`Allocated ${procId} (${reqSize} KB) in Partition ${chosenIdx} using ${algo}.`, 'info');
    } else {
        showStatus(`Allocation FAILED for ${procId} (${reqSize} KB). External Fragmentation!`, 'error');
    }

    renderContiguousPartitions();
}

function handleContiguousDeallocate() {
    const procId = dom.allocProcId.value.trim();
    let count = 0;
    simState.contiguousBlocks.forEach(b => {
        if (b.isAllocated && b.processId === procId) {
            b.isAllocated = false;
            b.processId = '';
            b.internalFrag = 0;
            count++;
        }
    });
    if (count > 0) showStatus(`Freed ${count} partition block(s) for ${procId}.`, 'info');
    else showStatus(`No allocated partitions found for process ${procId}.`, 'error');
    renderContiguousPartitions();
}

function renderContiguousPartitions() {
    dom.partitionContainer.innerHTML = '';
    let totalInternalFrag = 0;
    let totalExternalFrag = 0;
    let totalAllocated = 0;

    simState.contiguousBlocks.forEach((blk, idx) => {
        const div = document.createElement('div');
        div.className = 'partition-block';

        if (blk.isAllocated) {
            totalInternalFrag += blk.internalFrag;
            totalAllocated += (blk.sizeKB - blk.internalFrag);
            const usedPct = (((blk.sizeKB - blk.internalFrag) / blk.sizeKB) * 100).toFixed(0);
            const fragPct = ((blk.internalFrag / blk.sizeKB) * 100).toFixed(0);

            div.innerHTML = `
                <div class="used-part" style="width: ${usedPct}%">
                    Block ${idx}: ${blk.processId} (${blk.sizeKB - blk.internalFrag} KB)
                </div>
                ${blk.internalFrag > 0 ? `<div class="frag-part" style="width: ${fragPct}%">Internal Frag: ${blk.internalFrag} KB</div>` : ''}
            `;
        } else {
            totalExternalFrag += blk.sizeKB;
            div.innerHTML = `
                <div class="free-part">
                    Partition ${idx} FREE (${blk.sizeKB} KB)
                </div>
            `;
        }
        dom.partitionContainer.appendChild(div);
    });

    dom.internalFragVal.textContent = `${totalInternalFrag} KB`;
    dom.externalFragVal.textContent = `${totalExternalFrag} KB`;
    dom.allocatedSpaceVal.textContent = `${totalAllocated} KB`;
}

// --- Benchmark & Belady's Anomaly Module ---
function runBenchmarkSuite() {
    const algos = ['FIFO', 'LRU', 'OPTIMAL', 'CLOCK', 'LFU', 'MFU', 'MRU', 'RANDOM'];
    const refs = parseRefString();
    if (!refs.length) {
        showStatus('Please set a valid reference string before running benchmark.', 'error');
        return;
    }

    const results = [];
    algos.forEach(algo => {
        const proc = { id: 'P1', pageCount: Math.max(...refs) + 1, faults: 0, hits: 0, pages: new Array(Math.max(...refs) + 1).fill(-1) };
        const frames = new Array(simState.totalFrames || 4).fill(null).map(() => ({ processId: '', pageId: -1, loadTime: -1, lastAccessTime: -1, accessCount: 0, refBit: 0 }));
        
        refs.forEach((reqPage, stepIdx) => {
            let frameIdx = proc.pages[reqPage];
            if (frameIdx !== undefined && frameIdx !== -1 && frames[frameIdx].pageId === reqPage) {
                proc.hits++;
                frames[frameIdx].lastAccessTime = stepIdx;
                frames[frameIdx].accessCount++;
                frames[frameIdx].refBit = 1;
            } else {
                proc.faults++;
                let victimFrame = frames.findIndex(f => f.pageId === -1);
                if (victimFrame === -1) {
                    if (algo === 'LRU') {
                        let oldest = Infinity;
                        frames.forEach((f, i) => { if (f.lastAccessTime < oldest) { oldest = f.lastAccessTime; victimFrame = i; } });
                    } else if (algo === 'LFU') {
                        let minF = Infinity;
                        frames.forEach((f, i) => { if (f.accessCount < minF) { minF = f.accessCount; victimFrame = i; } });
                    } else if (algo === 'MFU') {
                        let maxF = -1;
                        frames.forEach((f, i) => { if (f.accessCount > maxF) { maxF = f.accessCount; victimFrame = i; } });
                    } else if (algo === 'MRU') {
                        let newest = -1;
                        frames.forEach((f, i) => { if (f.lastAccessTime > newest) { newest = f.lastAccessTime; victimFrame = i; } });
                    } else if (algo === 'CLOCK') {
                        victimFrame = stepIdx % frames.length;
                    } else if (algo === 'OPTIMAL') {
                        let farthest = -1;
                        frames.forEach((f, i) => {
                            let nextUse = Infinity;
                            for (let k = stepIdx + 1; k < refs.length; k++) {
                                if (refs[k] === f.pageId) { nextUse = k; break; }
                            }
                            if (nextUse > farthest) { farthest = nextUse; victimFrame = i; }
                        });
                    } else if (algo === 'RANDOM') {
                        victimFrame = Math.floor(Math.random() * frames.length);
                    } else { // FIFO
                        let oldestLoad = Infinity;
                        frames.forEach((f, i) => { if (f.loadTime < oldestLoad) { oldestLoad = f.loadTime; victimFrame = i; } });
                    }
                }
                if (frames[victimFrame].pageId !== -1) proc.pages[frames[victimFrame].pageId] = -1;
                proc.pages[reqPage] = victimFrame;
                frames[victimFrame] = { processId: 'P1', pageId: reqPage, loadTime: stepIdx, lastAccessTime: stepIdx, accessCount: 1, refBit: 1 };
            }
        });

        const total = proc.hits + proc.faults;
        const ratio = total > 0 ? ((proc.hits / total) * 100).toFixed(1) : 0;
        results.push({ algo, hits: proc.hits, faults: proc.faults, ratio });
    });

    renderBenchmarkTable(results);
    renderBenchmarkChart(results);
    showStatus('Multi-algorithm benchmark benchmark finished successfully!', 'info');
}

function testBeladyAnomaly() {
    const beladyString = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
    dom.refStringInput.value = beladyString.join(', ');

    // Run FIFO with 3 frames
    const f3 = runFifoTest(beladyString, 3);
    // Run FIFO with 4 frames
    const f4 = runFifoTest(beladyString, 4);

    showStatus(`Belady's Anomaly Test: FIFO with 3 Frames produced ${f3} faults. FIFO with 4 Frames produced ${f4} faults! (${f4 > f3 ? 'ANOMALY DETECTED!' : 'No anomaly on this string'})`, f4 > f3 ? 'error' : 'info');
}

function runFifoTest(refs, frameCount) {
    let faults = 0;
    const pages = {};
    const frames = new Array(frameCount).fill(null).map(() => ({ pageId: -1, loadTime: -1 }));
    
    refs.forEach((p, step) => {
        if (pages[p] !== undefined && pages[p] !== -1) return;
        faults++;
        let victim = frames.findIndex(f => f.pageId === -1);
        if (victim === -1) {
            let oldest = Infinity;
            frames.forEach((f, i) => { if (f.loadTime < oldest) { oldest = f.loadTime; victim = i; } });
        }
        if (frames[victim].pageId !== -1) pages[frames[victim].pageId] = -1;
        pages[p] = victim;
        frames[victim] = { pageId: p, loadTime: step };
    });
    return faults;
}

function renderBenchmarkTable(results) {
    dom.benchmarkTableBody.innerHTML = results.map(r => `
        <tr>
            <td><strong>${r.algo}</strong></td>
            <td style="color:var(--success)">${r.hits}</td>
            <td style="color:var(--danger)">${r.faults}</td>
            <td><strong style="color:var(--accent)">${r.ratio}%</strong></td>
            <td>${r.faults}</td>
        </tr>
    `).join('');
}

function renderBenchmarkChart(results) {
    if (!dom.chartCanvas) return;
    const ctx = dom.chartCanvas.getContext('2d');
    
    if (benchmarkChartInstance) {
        benchmarkChartInstance.destroy();
    }

    benchmarkChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: results.map(r => r.algo),
            datasets: [
                {
                    label: 'Page Faults (Lower is Better)',
                    data: results.map(r => r.faults),
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: '#ef4444',
                    borderWidth: 1
                },
                {
                    label: 'Page Hits (Higher is Better)',
                    data: results.map(r => r.hits),
                    backgroundColor: 'rgba(16, 185, 129, 0.7)',
                    borderColor: '#10b981',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#1e293b' } }
            }
        }
    });
}

function showStatus(msg, type = 'info') {
    dom.globalStatus.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> <span>${msg}</span>`;
    dom.globalStatus.style.borderLeftColor = type === 'error' ? 'var(--danger)' : 'var(--primary)';
}