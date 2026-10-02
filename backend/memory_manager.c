#include "manager_manager.h"
#include <stdbool.h>
#include <time.h>

// --- System Management ---

SystemState* init_system(int total_memory_kb, int frame_size_kb) {
    SystemState *state = (SystemState*)malloc(sizeof(SystemState));
    if (!state) return NULL;

    state->total_frames = total_memory_kb / frame_size_kb;
    if (state->total_frames <= 0) state->total_frames = 1;
    state->frame_size_kb = frame_size_kb;
    state->next_time_stamp = 0;
    state->clock_hand = 0;
    state->process_count = 0;
    state->last_allocated_block_index = 0;

    state->memory = (Frame*)calloc(state->total_frames, sizeof(Frame));
    if (!state->memory) {
        free(state);
        return NULL;
    }

    for (int i = 0; i < state->total_frames; i++) {
        state->memory[i].page_id = -1;
        state->memory[i].load_time = -1;
        state->memory[i].last_access_time = -1;
        state->memory[i].access_count = 0;
        state->memory[i].ref_bit = 0;
        state->memory[i].dirty_bit = 0;
        state->memory[i].process_id[0] = '\0';
    }

    // Initialize Contiguous Memory Blocks (Divide RAM into 8 default partitions for simulation)
    state->block_count = 8;
    int partition_size = total_memory_kb / state->block_count;
    for (int i = 0; i < state->block_count; i++) {
        state->blocks[i].id = i;
        state->blocks[i].size_kb = partition_size;
        state->blocks[i].start_address = i * partition_size;
        state->blocks[i].is_allocated = false;
        state->blocks[i].process_id[0] = '\0';
        state->blocks[i].internal_frag_kb = 0;
    }

    srand((unsigned int)time(NULL));
    return state;
}

void cleanup_system(SystemState *state) {
    if (state) {
        if (state->memory) free(state->memory);
        free(state);
    }
}

void reset_system(SystemState *state) {
    if (!state) return;
    
    for (int i = 0; i < state->process_count; i++) {
        state->processes[i].faults = 0;
        state->processes[i].hits = 0;
        for (int j = 0; j < state->processes[i].page_count; j++) {
            state->processes[i].page_table[j] = -1;
        }
    }
    
    for (int i = 0; i < state->total_frames; i++) {
        state->memory[i].page_id = -1;
        state->memory[i].load_time = -1;
        state->memory[i].last_access_time = -1;
        state->memory[i].access_count = 0;
        state->memory[i].ref_bit = 0;
        state->memory[i].dirty_bit = 0;
        state->memory[i].process_id[0] = '\0';
    }
    
    for (int i = 0; i < state->block_count; i++) {
        state->blocks[i].is_allocated = false;
        state->blocks[i].process_id[0] = '\0';
        state->blocks[i].internal_frag_kb = 0;
    }

    state->next_time_stamp = 0;
    state->clock_hand = 0;
    state->last_allocated_block_index = 0;
}

// --- Process Management ---

Process* find_process_c(SystemState *state, const char *process_id) {
    if (!state) return NULL;
    for (int i = 0; i < state->process_count; i++) {
        if (strcmp(state->processes[i].id, process_id) == 0) {
            return &state->processes[i];
        }
    }
    return NULL;
}

int load_process(SystemState *state, const char *process_id, int size_kb) {
    if (!state) return -3;

    // Check if process already exists
    Process *existing = find_process_c(state, process_id);
    if (existing) return 0;

    if (state->process_count >= MAX_PROCESSES) return -1; 

    Process *p = &state->processes[state->process_count];
    strncpy(p->id, process_id, sizeof(p->id) - 1);
    p->id[sizeof(p->id) - 1] = '\0';
    p->page_count = (size_kb + state->frame_size_kb - 1) / state->frame_size_kb; 
    p->faults = 0;
    p->hits = 0;

    if (p->page_count > MAX_PAGES) return -2; 

    for (int i = 0; i < p->page_count; i++) {
        p->page_table[i] = -1;
    }

    state->process_count++;
    return 0;
}

// --- Page Replacement Selection Helpers ---

int select_victim_fifo(SystemState *state) {
    int victim = 0;
    int oldest = state->memory[0].load_time;
    for (int i = 1; i < state->total_frames; i++) {
        if (state->memory[i].load_time < oldest) {
            oldest = state->memory[i].load_time;
            victim = i;
        }
    }
    return victim;
}

int select_victim_lru(SystemState *state) {
    int victim = 0;
    int oldest_access = state->memory[0].last_access_time;
    for (int i = 1; i < state->total_frames; i++) {
        if (state->memory[i].last_access_time < oldest_access) {
            oldest_access = state->memory[i].last_access_time;
            victim = i;
        }
    }
    return victim;
}

int select_victim_mru(SystemState *state) {
    int victim = 0;
    int newest_access = state->memory[0].last_access_time;
    for (int i = 1; i < state->total_frames; i++) {
        if (state->memory[i].last_access_time > newest_access) {
            newest_access = state->memory[i].last_access_time;
            victim = i;
        }
    }
    return victim;
}

int select_victim_lfu(SystemState *state) {
    int victim = 0;
    int min_freq = state->memory[0].access_count;
    for (int i = 1; i < state->total_frames; i++) {
        if (state->memory[i].access_count < min_freq) {
            min_freq = state->memory[i].access_count;
            victim = i;
        }
    }
    return victim;
}

int select_victim_mfu(SystemState *state) {
    int victim = 0;
    int max_freq = state->memory[0].access_count;
    for (int i = 1; i < state->total_frames; i++) {
        if (state->memory[i].access_count > max_freq) {
            max_freq = state->memory[i].access_count;
            victim = i;
        }
    }
    return victim;
}

int select_victim_clock(SystemState *state) {
    while (true) {
        int idx = state->clock_hand;
        state->clock_hand = (state->clock_hand + 1) % state->total_frames;

        if (state->memory[idx].ref_bit == 0) {
            return idx;
        } else {
            state->memory[idx].ref_bit = 0; // Give second chance
        }
    }
}

int select_victim_optimal(SystemState *state, const int *future_refs, int future_len, int current_ref_index) {
    int victim = 0;
    int farthest = -1;

    for (int i = 0; i < state->total_frames; i++) {
        int page_id = state->memory[i].page_id;
        int next_use = INT_MAX;

        if (future_refs != NULL && future_len > 0) {
            for (int k = current_ref_index + 1; k < future_len; k++) {
                if (future_refs[k] == page_id) {
                    next_use = k;
                    break;
                }
            }
        }

        if (next_use > farthest) {
            farthest = next_use;
            victim = i;
        }
    }
    return victim;
}

int select_victim_random(SystemState *state) {
    return rand() % state->total_frames;
}

// Main page allocation/replacement step
int step_simulation_c(SystemState *state, const char *algo, const char *process_id, int page_id, const int *future_refs, int future_len, int current_ref_index) {
    Process *current_proc = find_process_c(state, process_id);
    if (!current_proc) {
        // Auto load process if missing
        load_process(state, process_id, 256);
        current_proc = find_process_c(state, process_id);
        if (!current_proc) return -1;
    }

    if (page_id >= current_proc->page_count) {
        current_proc->page_count = page_id + 1;
    }

    int frame_index = current_proc->page_table[page_id];

    if (frame_index != -1 && frame_index < state->total_frames &&
        strcmp(state->memory[frame_index].process_id, process_id) == 0 &&
        state->memory[frame_index].page_id == page_id) {
        
        // --- PAGE HIT ---
        current_proc->hits++;
        state->memory[frame_index].last_access_time = state->next_time_stamp;
        state->memory[frame_index].access_count++;
        state->memory[frame_index].ref_bit = 1;
        state->next_time_stamp++;
        return frame_index;

    } else {
        // --- PAGE FAULT ---
        current_proc->faults++;
        
        // Check for free frame
        int victim_frame = -1;
        for (int i = 0; i < state->total_frames; i++) {
            if (state->memory[i].page_id == -1) {
                victim_frame = i;
                break;
            }
        }

        // If no free frame, run page replacement algorithm
        if (victim_frame == -1) {
            if (strcmp(algo, "LRU") == 0) {
                victim_frame = select_victim_lru(state);
            } else if (strcmp(algo, "CLOCK") == 0 || strcmp(algo, "SECOND_CHANCE") == 0) {
                victim_frame = select_victim_clock(state);
            } else if (strcmp(algo, "LFU") == 0) {
                victim_frame = select_victim_lfu(state);
            } else if (strcmp(algo, "MFU") == 0) {
                victim_frame = select_victim_mfu(state);
            } else if (strcmp(algo, "MRU") == 0) {
                victim_frame = select_victim_mru(state);
            } else if (strcmp(algo, "OPTIMAL") == 0 || strcmp(algo, "OPT") == 0) {
                victim_frame = select_victim_optimal(state, future_refs, future_len, current_ref_index);
            } else if (strcmp(algo, "RANDOM") == 0) {
                victim_frame = select_victim_random(state);
            } else {
                // Default to FIFO
                victim_frame = select_victim_fifo(state);
            }
        }

        // Evict existing victim page if occupied
        if (state->memory[victim_frame].page_id != -1) {
            Process *victim_proc = find_process_c(state, state->memory[victim_frame].process_id);
            if (victim_proc && state->memory[victim_frame].page_id < victim_proc->page_count) {
                victim_proc->page_table[state->memory[victim_frame].page_id] = -1;
            }
        }

        // Load new page into victim frame
        current_proc->page_table[page_id] = victim_frame;
        
        Frame *frame = &state->memory[victim_frame];
        strncpy(frame->process_id, process_id, sizeof(frame->process_id) - 1);
        frame->process_id[sizeof(frame->process_id) - 1] = '\0';
        frame->page_id = page_id;
        frame->load_time = state->next_time_stamp;
        frame->last_access_time = state->next_time_stamp;
        frame->access_count = 1;
        frame->ref_bit = 1;
        frame->dirty_bit = (rand() % 2); // Simulating read/write page dirty state
        
        state->next_time_stamp++;
        return victim_frame;
    }
}

// --- Dynamic Contiguous Memory Allocation (First Fit, Best Fit, Worst Fit, Next Fit) ---

int allocate_contiguous(SystemState *state, const char *algo, const char *process_id, int size_kb) {
    if (!state) return -1;
    int chosen_idx = -1;

    if (strcmp(algo, "FIRST_FIT") == 0) {
        for (int i = 0; i < state->block_count; i++) {
            if (!state->blocks[i].is_allocated && state->blocks[i].size_kb >= size_kb) {
                chosen_idx = i;
                break;
            }
        }
    } else if (strcmp(algo, "BEST_FIT") == 0) {
        int best_size = INT_MAX;
        for (int i = 0; i < state->block_count; i++) {
            if (!state->blocks[i].is_allocated && state->blocks[i].size_kb >= size_kb) {
                if (state->blocks[i].size_kb < best_size) {
                    best_size = state->blocks[i].size_kb;
                    chosen_idx = i;
                }
            }
        }
    } else if (strcmp(algo, "WORST_FIT") == 0) {
        int worst_size = -1;
        for (int i = 0; i < state->block_count; i++) {
            if (!state->blocks[i].is_allocated && state->blocks[i].size_kb >= size_kb) {
                if (state->blocks[i].size_kb > worst_size) {
                    worst_size = state->blocks[i].size_kb;
                    chosen_idx = i;
                }
            }
        }
    } else if (strcmp(algo, "NEXT_FIT") == 0) {
        for (int count = 0; count < state->block_count; count++) {
            int i = (state->last_allocated_block_index + count) % state->block_count;
            if (!state->blocks[i].is_allocated && state->blocks[i].size_kb >= size_kb) {
                chosen_idx = i;
                state->last_allocated_block_index = i;
                break;
            }
        }
    }

    if (chosen_idx != -1) {
        state->blocks[chosen_idx].is_allocated = true;
        strncpy(state->blocks[chosen_idx].process_id, process_id, sizeof(state->blocks[chosen_idx].process_id) - 1);
        state->blocks[chosen_idx].internal_frag_kb = state->blocks[chosen_idx].size_kb - size_kb;
        return chosen_idx;
    }
    return -1; // Allocation failed (External fragmentation)
}

int deallocate_contiguous(SystemState *state, const char *process_id) {
    if (!state) return 0;
    int freed = 0;
    for (int i = 0; i < state->block_count; i++) {
        if (state->blocks[i].is_allocated && strcmp(state->blocks[i].process_id, process_id) == 0) {
            state->blocks[i].is_allocated = false;
            state->blocks[i].process_id[0] = '\0';
            state->blocks[i].internal_frag_kb = 0;
            freed++;
        }
    }
    return freed;
}

// --- JSON Serialization ---

void print_json_state(SystemState *state, const char *action, int frame_index, const char* message) {
    if (!state) {
        printf("{\"ok\": false, \"error\": \"System not initialized.\"}\n");
        return;
    }
    
    printf("{");
    printf("\"ok\": true,");
    printf("\"message\": \"%s\",", message);
    printf("\"frame\": %d,", frame_index);
    printf("\"action\": \"%s\",", action);
    
    printf("\"currentState\": {");
        printf("\"totalFrames\": %d,", state->total_frames);
        printf("\"frameSizeKB\": %d,", state->frame_size_kb);
        printf("\"simulationStep\": %d,", state->next_time_stamp);
        printf("\"clockHand\": %d,", state->clock_hand);
        
        // Memory Array
        printf("\"memory\": [");
        for (int i = 0; i < state->total_frames; i++) {
            printf("{");
            printf("\"processId\": \"%s\",", state->memory[i].process_id); 
            printf("\"pageId\": %d,", state->memory[i].page_id);
            printf("\"loadTime\": %d,", state->memory[i].load_time);
            printf("\"lastAccessTime\": %d,", state->memory[i].last_access_time);
            printf("\"accessCount\": %d,", state->memory[i].access_count);
            printf("\"refBit\": %d,", state->memory[i].ref_bit);
            printf("\"dirtyBit\": %d", state->memory[i].dirty_bit);
            printf("}%s", (i == state->total_frames - 1) ? "" : ",");
        }
        printf("],");
        
        // Contiguous Memory Blocks Array
        printf("\"blocks\": [");
        for (int i = 0; i < state->block_count; i++) {
            printf("{");
            printf("\"id\": %d,", state->blocks[i].id);
            printf("\"sizeKB\": %d,", state->blocks[i].size_kb);
            printf("\"startAddress\": %d,", state->blocks[i].start_address);
            printf("\"isAllocated\": %s,", state->blocks[i].is_allocated ? "true" : "false");
            printf("\"processId\": \"%s\",", state->blocks[i].process_id);
            printf("\"internalFragKB\": %d", state->blocks[i].internal_frag_kb);
            printf("}%s", (i == state->block_count - 1) ? "" : ",");
        }
        printf("],");

        // Processes Array
        printf("\"processes\": [");
        for (int i = 0; i < state->process_count; i++) {
            Process *p = &state->processes[i];
            printf("{");
            printf("\"id\": \"%s\",", p->id);
            printf("\"faults\": %d,", p->faults);
            printf("\"hits\": %d,", p->hits);
            printf("\"pageCount\": %d,", p->page_count);
            printf("\"pages\": [");
            for (int j = 0; j < p->page_count; j++) {
                printf("%d%s", p->page_table[j], (j == p->page_count - 1) ? "" : ",");
            }
            printf("]");
            printf("}%s", (i == state->process_count - 1) ? "" : ",");
        }
        printf("]");
    printf("}"); 
    printf("}\n");
}