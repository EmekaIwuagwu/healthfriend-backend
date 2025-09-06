import { Document } from 'mongoose';

export interface IAppointment extends Document {
  _id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  type: 'video_call' | 'home_visit';
  scheduledDateTime: Date;
  duration: number; // in minutes
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  consultationId?: string;
  notes?: string;
  cancellationReason?: string;
  cancellationDate?: Date;
  cancelledBy?: 'patient' | 'doctor' | 'admin';
  reschedulingHistory?: IReschedulingRecord[];
  remindersSent: Date[];
  confirmationRequired: boolean;
  confirmedAt?: Date;
  checkedInAt?: Date;
  timeZone: string;
  recurringAppointment?: IRecurringAppointment;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReschedulingRecord {
  originalDateTime: Date;
  newDateTime: Date;
  reason: string;
  rescheduledBy: 'patient' | 'doctor' | 'admin';
  rescheduledAt: Date;
  _id?: string;
}

export interface IRecurringAppointment {
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  endDate?: Date;
  maxOccurrences?: number;
  currentOccurrence: number;
  parentAppointmentId?: string;
  isActive: boolean;
}

// Request/Response interfaces
export interface IAppointmentRequest {
  doctorId: string;
  type: 'video_call' | 'home_visit';
  scheduledDateTime: Date;
  duration?: number;
  notes?: string;
  timeZone: string;
  recurringAppointment?: Omit<IRecurringAppointment, 'currentOccurrence' | 'isActive'>;
}

export interface IAppointmentUpdate {
  scheduledDateTime?: Date;
  duration?: number;
  status?: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
  cancellationReason?: string;
}

export interface IAppointmentReschedule {
  appointmentId: string;
  newDateTime: Date;
  reason: string;
  notifyOtherParty: boolean;
}

export interface IAppointmentFilter {
  patientId?: string;
  doctorId?: string;
  type?: 'video_call' | 'home_visit';
  status?: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  dateFrom?: Date;
  dateTo?: Date;
  timeZone?: string;
  recurring?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'scheduledDateTime' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface IAppointmentAvailability {
  doctorId: string;
  date: Date;
  availableSlots: ITimeSlot[];
  bookedSlots: ITimeSlot[];
  workingHours: {
    start: string;
    end: string;
  };
}

export interface ITimeSlot {
  startTime: string; // Format: "HH:MM"
  endTime: string;   // Format: "HH:MM"
  duration: number;  // in minutes
  available: boolean;
  appointmentId?: string;
}

export interface IAppointmentReminder {
  appointmentId: string;
  recipientId: string;
  recipientType: 'patient' | 'doctor';
  reminderType: '24_hours' | '2_hours' | '30_minutes' | '10_minutes';
  method: 'email' | 'sms' | 'push' | 'in_app';
  scheduledFor: Date;
  sentAt?: Date;
  status: 'pending' | 'sent' | 'failed';
  content: string;
}

export interface IAppointmentConflict {
  appointmentId: string;
  conflictType: 'double_booking' | 'outside_hours' | 'past_date' | 'insufficient_duration';
  conflictingAppointmentId?: string;
  message: string;
  suggestions?: string[];
}

export interface IAppointmentStats {
  totalAppointments: number;
  scheduledAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowRate: number;
  averageDuration: number;
  rescheduleRate: number;
  byType: {
    videoCall: number;
    homeVisit: number;
  };
  byStatus: {
    scheduled: number;
    confirmed: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
  upcomingToday: number;
  upcomingWeek: number;
  popularTimeSlots: Array<{
    hour: number;
    count: number;
  }>;
}