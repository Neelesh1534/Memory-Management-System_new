// app.c (C CLI Wrapper for Node.js backend integration)
#include "manager_manager.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

SystemState *global_state = NULL; 
#define STATE_FILE "simulator_state.dat" 

void save_state(SystemState *state) {
    if (!state) return;
    FILE *f = fopen(STATE_FILE, "wb");
    if (!f) return;
    fwrite(state, sizeof(SystemState), 1, f);
    if (state->memory) {
        fwrite(state->memory, sizeof(Frame), state->total_frames, f);
    }
    fclose(f);
}

SystemState* load_state() {
    FILE *f = fopen(STATE_FILE, "rb");
    if (!f) return NULL; 

    SystemState *state = (SystemState*)malloc(sizeof(SystemState));
    if (!state || fread(state, sizeof(SystemState), 1, f) != 1) {
        if (state) free(state);
        fclose(f);
        return NULL;
    }
    
    state->memory = (Frame*)calloc(state->total_frames, sizeof(Frame));
    if (!state->memory || fread(state->memory, sizeof(Frame), state->total_frames, f) != state->total_frames) {
        cleanup_system(state);
        fclose(f);
        return NULL;
    }
    fclose(f);
    return state;
}

int main() {
    global_state = load_state();

    char line[1024];
    if (fgets(line, sizeof(line), stdin) == NULL) {
        if (global_state) cleanup_system(global_state);
        return 0;
    }
    
    char *token = strtok(line, " \n\r");
    if (!token) {
        if (global_state) cleanup_system(global_state);
        return 0;
    }

    char command[32];
    strncpy(command, token, sizeof(command) - 1);
    command[sizeof(command) - 1] = '\0';

    int frame_index = -1;
    char action[32] = "n/a";
    char message[256] = "Command executed successfully.";

    if (strcmp(command, "INIT") == 0) {
        char *t_mem = strtok(NULL, " ");
        char *f_sz = strtok(NULL, " ");
        int total_mem = t_mem ? atoi(t_mem) : 4096;
        int frame_size = f_sz ? atoi(f_sz) : 64;
        
        if (global_state) cleanup_system(global_state);
        global_state = init_system(total_mem, frame_size);
        strcpy(message, "System initialized with expanded RAM algorithms.");

    } else if (strcmp(command, "LOAD") == 0) {
        char *p_id = strtok(NULL, " ");
        char *sz_str = strtok(NULL, " ");
        int size = sz_str ? atoi(sz_str) : 256;
        
        if (!global_state) global_state = init_system(4096, 64);
        load_process(global_state, p_id ? p_id : "P1", size);
        sprintf(message, "Process %s loaded (%d KB).", p_id ? p_id : "P1", size);

    } else if (strcmp(command, "STEP") == 0) {
        char *p_id = strtok(NULL, " ");
        char *pg_str = strtok(NULL, " ");
        char *algo = strtok(NULL, " ");
        
        if (!global_state) global_state = init_system(4096, 64);

        int page_id = pg_str ? atoi(pg_str) : 0;
        char algo_name[32] = "FIFO";
        if (algo) strncpy(algo_name, algo, sizeof(algo_name) - 1);

        Process *proc = find_process_c(global_state, p_id ? p_id : "P1");
        int old_faults = proc ? proc->faults : 0;

        frame_index = step_simulation_c(global_state, algo_name, p_id ? p_id : "P1", page_id, NULL, 0, 0);
        proc = find_process_c(global_state, p_id ? p_id : "P1");
        int new_faults = proc ? proc->faults : 0;

        if (new_faults > old_faults) {
            strcpy(action, "fault");
            sprintf(message, "%s Algorithm: PAGE FAULT for %s, Page %d (Assigned Frame %d)", algo_name, p_id ? p_id : "P1", page_id, frame_index);
        } else {
            strcpy(action, "hit");
            sprintf(message, "%s Algorithm: PAGE HIT for %s, Page %d (Frame %d)", algo_name, p_id ? p_id : "P1", page_id, frame_index);
        }

    } else if (strcmp(command, "ALLOC") == 0) {
        char *p_id = strtok(NULL, " ");
        char *sz_str = strtok(NULL, " ");
        char *algo = strtok(NULL, " ");
        int size = sz_str ? atoi(sz_str) : 512;
        char algo_name[32] = "FIRST_FIT";
        if (algo) strncpy(algo_name, algo, sizeof(algo_name) - 1);

        if (!global_state) global_state = init_system(4096, 64);
        int block_idx = allocate_contiguous(global_state, algo_name, p_id ? p_id : "P1", size);

        if (block_idx != -1) {
            strcpy(action, "allocated");
            sprintf(message, "Contiguous %s: Allocated %s (%d KB) in Partition Block %d.", algo_name, p_id ? p_id : "P1", size, block_idx);
        } else {
            strcpy(action, "failed");
            sprintf(message, "Contiguous %s: Allocation FAILED for %s (%d KB). External Fragmentation!", algo_name, p_id ? p_id : "P1", size);
        }

    } else if (strcmp(command, "DEALLOC") == 0) {
        char *p_id = strtok(NULL, " ");
        if (!global_state) global_state = init_system(4096, 64);
        int count = deallocate_contiguous(global_state, p_id ? p_id : "P1");
        strcpy(action, "freed");
        sprintf(message, "Deallocated memory partition for process %s (%d blocks freed).", p_id ? p_id : "P1", count);

    } else if (strcmp(command, "RESET") == 0) {
        if (global_state) reset_system(global_state);
        strcpy(message, "Simulation state reset.");
    }

    print_json_state(global_state, action, frame_index, message);
    save_state(global_state); 
    
    if (global_state) cleanup_system(global_state);
    return 0;
}