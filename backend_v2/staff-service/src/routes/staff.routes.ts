/**
 * Staff Service Routes
 * =====================
 * All routes require authentication.
 * Most routes additionally require staff or admin group membership.
 *
 * Pattern: Matches booking-service/routes with auth + verification middleware.
 */

import { Router } from 'express';
import { authMiddleware, requireStaffOrAdmin } from '../middleware/auth.middleware';
import { validate, VideoSessionBody } from '../../../shared/validation';
import { z } from 'zod';
import {
    createShift,
    getShifts,
    updateShift,
    deleteShift,
    createTask,
    getTasks,
    updateTask,
    deleteTask,
    createAnnouncement,
    getAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    getStaffDirectory,
} from '../controllers/staff.controller';

const router = Router();

// ─── Zod Schemas for Staff Service ──────────────────────────────────────

const CreateShiftBody = z.object({
    staffId: z.string().min(1, 'Staff ID is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    department: z.string().min(1, 'Department is required'),
    role: z.string().optional(),
    notes: z.string().max(1000).optional(),
});

const UpdateShiftBody = z.object({
    shiftId: z.string().uuid('Invalid shift ID'),
    status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    notes: z.string().max(1000).optional(),
});

const CreateTaskBody = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    assignedTo: z.string().min(1, 'Assignee is required'),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).default('Medium'),
    dueDate: z.string().optional(),
    department: z.string().optional(),
});

const UpdateTaskBody = z.object({
    taskId: z.string().uuid('Invalid task ID'),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
    notes: z.string().max(2000).optional(),
});

const CreateAnnouncementBody = z.object({
    title: z.string().min(1, 'Title is required').max(200),
    content: z.string().min(1, 'Content is required').max(5000),
    priority: z.enum(['Low', 'Normal', 'High', 'Critical']).default('Normal'),
    department: z.string().optional(),
});

const UpdateAnnouncementBody = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).max(5000).optional(),
    priority: z.enum(['Low', 'Normal', 'High', 'Critical']).optional(),
    category: z.string().max(100).optional(),
});

// =============================================================================
// SHIFT MANAGEMENT (Staff/Admin only)
// =============================================================================

router.post('/shifts', authMiddleware, requireStaffOrAdmin, validate({ body: CreateShiftBody }), createShift);
router.get('/shifts', authMiddleware, requireStaffOrAdmin, getShifts);
router.put('/shifts', authMiddleware, requireStaffOrAdmin, validate({ body: UpdateShiftBody }), updateShift);
router.delete('/shifts/:shiftId', authMiddleware, requireStaffOrAdmin, deleteShift);

// =============================================================================
// TASK MANAGEMENT (Staff/Admin only)
// =============================================================================

router.post('/tasks', authMiddleware, requireStaffOrAdmin, validate({ body: CreateTaskBody }), createTask);
router.get('/tasks', authMiddleware, requireStaffOrAdmin, getTasks);
router.put('/tasks', authMiddleware, requireStaffOrAdmin, validate({ body: UpdateTaskBody }), updateTask);
router.delete('/tasks/:taskId', authMiddleware, requireStaffOrAdmin, deleteTask);

// =============================================================================
// ANNOUNCEMENTS (Read: any auth user, Write: Staff/Admin only)
// =============================================================================

router.post('/announcements', authMiddleware, requireStaffOrAdmin, validate({ body: CreateAnnouncementBody }), createAnnouncement);
router.get('/announcements', authMiddleware, getAnnouncements);
router.put('/announcements/:announcementId', authMiddleware, requireStaffOrAdmin, validate({ body: UpdateAnnouncementBody }), updateAnnouncement);
router.delete('/announcements/:announcementId', authMiddleware, requireStaffOrAdmin, deleteAnnouncement);

// =============================================================================
// STAFF DIRECTORY (Any authenticated user can view)
// =============================================================================

router.get('/directory', authMiddleware, getStaffDirectory);

export default router;
