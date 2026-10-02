#ifndef MEMORY_MANAGER_H
#define MEMORY_MANAGER_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
#include <stdbool.h>

#define MAX_PAGES 4096 
#define MAX_PROCESSES 20 
#define MAX_BLOCKS 64

// --- Data Structures ---

typedef struct {
    char id[64];          
    int page_count;       
    int faults;
    int hits;
    int page_table[MAX_PAGES]; 
} Process;

typedef struct {
    char process_id[64];
    int page_id;
    int load_time;
    int last_access_time;
    int access_count;
    int ref_bit;      // For Clock / Second Chance
    int dirty_bit;    // Modified status
} Frame;

typedef struct {
    int id;
    int size_kb;
    int start_address;
    bool is_allocated;
    char process_id[64];
    int internal_frag_kb;
} MemoryBlock;

typedef struct {
    int total_frames;
    int frame_size_kb;
    int next_time_stamp;  
    int clock_hand;   // Pointer for Clock algorithm
    Frame *memory;        
    Process processes[MAX_PROCESSES];
    int process_count;

    // Contiguous Memory Allocation Blocks
    MemoryBlock blocks[MAX_BLOCKS];
    int block_count;
    int last_allocated_block_index; // For Next-Fit
} SystemState;

// --- Function Prototypes ---

SystemState* init_system(int total_memory_kb, int frame_size_kb);
void cleanup_system(SystemState *state);
void reset_system(SystemState *state);

int load_process(SystemState *state, const char *process_id, int size_kb);
Process* find_process_c(SystemState *state, const char *process_id);

// Core step function: Returns the frame index used
int step_simulation_c(SystemState *state, const char *algo, const char *process_id, int page_id, const int *future_refs, int future_len, int current_ref_index);

// Dynamic Contiguous Allocation
int allocate_contiguous(SystemState *state, const char *algo, const char *process_id, int size_kb);
int deallocate_contiguous(SystemState *state, const char *process_id);

// JSON Serialization
void print_json_state(SystemState *state, const char *action, int frame_index, const char* message);

#endif