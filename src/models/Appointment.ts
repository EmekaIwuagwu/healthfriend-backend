import mongoose, { Schema, Model } from 'mongoose';
import { 
  IAppointment, 
  IReschedulingRecord, 
  IRecurringAppointment 
} from '../types/Appointment';

// Rescheduling Record Schema
const reschedulingRecordSchema = new Schema<IReschedulingRecord>({
  originalDateTime: {
    type: Date,
    required: true
  },
  newDateTime: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  rescheduledBy: {
    type: String,
    required: true,
    enum: ['patient', 'doctor', 'admin']
  },
  rescheduledAt: {
    type: Date,
    required: true,
    default: Date.now
  }
}, { timestamps: true });

// Recurring Appointment Schema
const recurringAppointmentSchema = new Schema<IRecurringAppointment>({
  frequency: {
    type: String,
    required: true,
    enum: ['weekly', 'biweekly', 'monthly', 'quarterly']
  },
  endDate: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v > new Date();
      },
      message: 'End date must be in the future'
    }
  },
  maxOccurrences: {
    type: Number,
    min: 1,
    max: 52 // Max 1 year of weekly appointments
  },
  currentOccurrence: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  parentAppointmentId: {
    type: String,
    ref: 'Appointment'
  },
  isActive: {
    type: Boolean,
    required: true,
    default: true
  }
}, { _id: false });

// Main Appointment Schema
const appointmentSchema = new Schema<IAppointment>({
  appointmentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  patientId: {
    type: String,
    required: true,
    ref: 'User'
  },
  doctorId: {
    type: String,
    required: true,
    ref: 'User'
  },
  type: {
    type: String,
    required: true,
    enum: ['video_call', 'home_visit']
  },
  scheduledDateTime: {
    type: Date,
    required: true,
    validate: {
      validator: function(v: Date) {
        return v > new Date();
      },
      message: 'Scheduled date time must be in the future'
    }
  },
  duration: {
    type: Number,
    required: true,
    min: 15,
    max: 180,
    default: 30
  },
  status: {
    type: String,
    required: true,
    enum: ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled'],
    default: 'scheduled'
  },
  consultationId: {
    type: String,
    ref: 'Consultation'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  cancellationReason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  cancellationDate: Date,
  cancelledBy: {
    type: String,
    enum: ['patient', 'doctor', 'admin']
  },
  reschedulingHistory: [reschedulingRecordSchema],
  remindersSent: {
    type: [Date],
    default: []
  },
  confirmationRequired: {
    type: Boolean,
    default: true
  },
  confirmedAt: Date,
  checkedInAt: Date,
  timeZone: {
    type: String,
    required: true,
    default: 'UTC'
  },
  recurringAppointment: recurringAppointmentSchema
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
appointmentSchema.index({ appointmentId: 1 });
appointmentSchema.index({ patientId: 1 });
appointmentSchema.index({ doctorId: 1 });
appointmentSchema.index({ scheduledDateTime: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ type: 1 });
appointmentSchema.index({ createdAt: -1 });

// Compound indexes
appointmentSchema.index({ patientId: 1, status: 1 });
appointmentSchema.index({ doctorId: 1, status: 1 });
appointmentSchema.index({ doctorId: 1, scheduledDateTime: 1 });
appointmentSchema.index({ patientId: 1, scheduledDateTime: 1 });
appointmentSchema.index({ status: 1, scheduledDateTime: 1 });
appointmentSchema.index({ scheduledDateTime: 1, status: 1 });

// Sparse indexes for optional fields
appointmentSchema.index({ consultationId: 1 }, { sparse: true });
appointmentSchema.index({ 'recurringAppointment.parentAppointmentId': 1 }, { sparse: true });

// Pre-save middleware
appointmentSchema.pre('save', function(next) {
  // Set confirmation timestamp when status changes to confirmed
  if (this.isModified('status') && this.status === 'confirmed' && !this.confirmedAt) {
    this.confirmedAt = new Date();
  }

  // Set cancellation date when status changes to cancelled
  if (this.isModified('status') && this.status === 'cancelled' && !this.cancellationDate) {
    this.cancellationDate = new Date();
  }

  // Validate that past appointments cannot be scheduled
  if (this.isModified('scheduledDateTime') && this.scheduledDateTime <= new Date()) {
    return next(new Error('Cannot schedule appointment in the past'));
  }

  // Validate cancellation reason is provided when cancelled
  if (this.status === 'cancelled' && !this.cancellationReason) {
    return next(new Error('Cancellation reason is required when cancelling appointment'));
  }

  next();
});

// Post-save middleware
appointmentSchema.post('save', function(doc) {
  // Create next recurring appointment if needed
  if (doc.recurringAppointment && doc.recurringAppointment.isActive && doc.status === 'completed') {
    createNextRecurringAppointment(doc);
  }
});

// Instance methods
appointmentSchema.methods.isUpcoming = function(): boolean {
  return this.scheduledDateTime > new Date() && ['scheduled', 'confirmed'].includes(this.status);
};

appointmentSchema.methods.isToday = function(): boolean {
  const today = new Date();
  const appointmentDate = new Date(this.scheduledDateTime);
  return appointmentDate.toDateString() === today.toDateString();
};

appointmentSchema.methods.isPast = function(): boolean {
  return this.scheduledDateTime < new Date();
};

appointmentSchema.methods.canBeConfirmed = function(): boolean {
  return this.status === 'scheduled' && this.isUpcoming();
};

appointmentSchema.methods.canBeRescheduled = function(): boolean {
  return ['scheduled', 'confirmed'].includes(this.status) && this.isUpcoming();
};

appointmentSchema.methods.canBeCancelled = function(): boolean {
  return ['scheduled', 'confirmed'].includes(this.status) && this.isUpcoming();
};

appointmentSchema.methods.confirm = function(): Promise<IAppointment> {
  if (!this.canBeConfirmed()) {
    throw new Error('Appointment cannot be confirmed');
  }

  this.status = 'confirmed';
  this.confirmedAt = new Date();
  return this.save();
};

appointmentSchema.methods.cancel = function(
  reason: string, 
  cancelledBy: 'patient' | 'doctor' | 'admin'
): Promise<IAppointment> {
  if (!this.canBeCancelled()) {
    throw new Error('Appointment cannot be cancelled');
  }

  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.cancellationDate = new Date();
  this.cancelledBy = cancelledBy;
  return this.save();
};

appointmentSchema.methods.reschedule = function(
  newDateTime: Date,
  reason: string,
  rescheduledBy: 'patient' | 'doctor' | 'admin'
): Promise<IAppointment> {
  if (!this.canBeRescheduled()) {
    throw new Error('Appointment cannot be rescheduled');
  }

  if (newDateTime <= new Date()) {
    throw new Error('New appointment time must be in the future');
  }

  // Add to rescheduling history
  this.reschedulingHistory = this.reschedulingHistory || [];
  this.reschedulingHistory.push({
    originalDateTime: this.scheduledDateTime,
    newDateTime,
    reason,
    rescheduledBy,
    rescheduledAt: new Date()
  });

  this.scheduledDateTime = newDateTime;
  this.status = 'rescheduled';
  
  return this.save();
};

appointmentSchema.methods.checkIn = function(): Promise<IAppointment> {
  if (this.status !== 'confirmed') {
    throw new Error('Only confirmed appointments can be checked in');
  }

  this.checkedInAt = new Date();
  this.status = 'in_progress';
  return this.save();
};

appointmentSchema.methods.complete = function(): Promise<IAppointment> {
  if (this.status !== 'in_progress') {
    throw new Error('Only in-progress appointments can be completed');
  }

  this.status = 'completed';
  return this.save();
};

appointmentSchema.methods.markNoShow = function(): Promise<IAppointment> {
  if (!['scheduled', 'confirmed'].includes(this.status)) {
    throw new Error('Only scheduled or confirmed appointments can be marked as no show');
  }

  this.status = 'no_show';
  return this.save();
};

appointmentSchema.methods.addReminder = function(sentAt?: Date): Promise<IAppointment> {
  this.remindersSent.push(sentAt || new Date());
  return this.save();
};

appointmentSchema.methods.getTimeUntilAppointment = function(): number {
  return this.scheduledDateTime.getTime() - Date.now();
};

appointmentSchema.methods.getFormattedDateTime = function(): string {
  return this.scheduledDateTime.toLocaleString('en-US', {
    timeZone: this.timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

appointmentSchema.methods.hasConflict = function(otherAppointments: IAppointment[]): boolean {
  const appointmentStart = this.scheduledDateTime.getTime();
  const appointmentEnd = appointmentStart + (this.duration * 60000);

  return otherAppointments.some(other => {
    if (other.appointmentId === this.appointmentId) return false;
    
    const otherStart = other.scheduledDateTime.getTime();
    const otherEnd = otherStart + (other.duration * 60000);
    
    return (appointmentStart < otherEnd && appointmentEnd > otherStart);
  });
};

// Static methods
appointmentSchema.statics.findByAppointmentId = function(appointmentId: string): Promise<IAppointment | null> {
  return this.findOne({ appointmentId });
};

appointmentSchema.statics.findByPatient = function(
  patientId: string, 
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
) {
  const query: any = { patientId };
  if (status) query.status = status;
  if (dateFrom || dateTo) {
    query.scheduledDateTime = {};
    if (dateFrom) query.scheduledDateTime.$gte = dateFrom;
    if (dateTo) query.scheduledDateTime.$lte = dateTo;
  }
  return this.find(query).sort({ scheduledDateTime: 1 });
};

appointmentSchema.statics.findByDoctor = function(
  doctorId: string, 
  status?: string,
  dateFrom?: Date,
  dateTo?: Date
) {
  const query: any = { doctorId };
  if (status) query.status = status;
  if (dateFrom || dateTo) {
    query.scheduledDateTime = {};
    if (dateFrom) query.scheduledDateTime.$gte = dateFrom;
    if (dateTo) query.scheduledDateTime.$lte = dateTo;
  }
  return this.find(query).sort({ scheduledDateTime: 1 });
};

appointmentSchema.statics.findUpcoming = function(timeRange: number = 24) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + timeRange * 60 * 60 * 1000);
  
  return this.find({
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledDateTime: { $gte: now, $lte: futureTime }
  }).sort({ scheduledDateTime: 1 });
};

appointmentSchema.statics.findToday = function(doctorId?: string) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const query: any = {
    scheduledDateTime: {
      $gte: new Date(today.setHours(0, 0, 0, 0)),
      $lt: new Date(tomorrow.setHours(0, 0, 0, 0))
    }
  };
  
  if (doctorId) query.doctorId = doctorId;
  
  return this.find(query).sort({ scheduledDateTime: 1 });
};

appointmentSchema.statics.findConflicts = function(
  doctorId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string
) {
  const query: any = {
    doctorId,
    status: { $in: ['scheduled', 'confirmed', 'in_progress'] },
    $or: [
      {
        scheduledDateTime: { $lt: endTime },
        $expr: {
          $gt: [
            { $add: ['$scheduledDateTime', { $multiply: ['$duration', 60000] }] },
            startTime
          ]
        }
      }
    ]
  };

  if (excludeAppointmentId) {
    query.appointmentId = { $ne: excludeAppointmentId };
  }

  return this.find(query);
};

appointmentSchema.statics.getDoctorAvailability = function(
  doctorId: string,
  date: Date
) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    doctorId,
    scheduledDateTime: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['scheduled', 'confirmed', 'in_progress'] }
  }).sort({ scheduledDateTime: 1 });
};

appointmentSchema.statics.getAppointmentStats = function(doctorId?: string, patientId?: string) {
  const matchStage: any = {};
  if (doctorId) matchStage.doctorId = doctorId;
  if (patientId) matchStage.patientId = patientId;

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAppointments: { $sum: 1 },
        scheduledAppointments: { $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] } },
        confirmedAppointments: { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
        completedAppointments: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelledAppointments: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        noShowAppointments: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
        averageDuration: { $avg: '$duration' },
        videoCallCount: { $sum: { $cond: [{ $eq: ['$type', 'video_call'] }, 1, 0] } },
        homeVisitCount: { $sum: { $cond: [{ $eq: ['$type', 'home_visit'] }, 1, 0] } }
      }
    },
    {
      $addFields: {
        noShowRate: { $divide: ['$noShowAppointments', '$totalAppointments'] },
        completionRate: { $divide: ['$completedAppointments', '$totalAppointments'] },
        cancellationRate: { $divide: ['$cancelledAppointments', '$totalAppointments'] }
      }
    }
  ]);
};

appointmentSchema.statics.findNeedingReminders = function(timeBeforeMinutes: number = 60) {
  const reminderTime = new Date(Date.now() + timeBeforeMinutes * 60000);
  
  return this.find({
    status: { $in: ['scheduled', 'confirmed'] },
    scheduledDateTime: { $lte: reminderTime, $gte: new Date() },
    $expr: {
      $lt: [{ $size: '$remindersSent' }, 3] // Max 3 reminders
    }
  });
};

// Helper function for creating recurring appointments
async function createNextRecurringAppointment(appointment: IAppointment) {
  if (!appointment.recurringAppointment) return;

  const { frequency, maxOccurrences, currentOccurrence, endDate } = appointment.recurringAppointment;
  
  // Check if we should create next occurrence
  if (maxOccurrences && currentOccurrence >= maxOccurrences) return;
  if (endDate && new Date() >= endDate) return;

  // Calculate next appointment date
  const nextDate = new Date(appointment.scheduledDateTime);
  switch (frequency) {
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case 'biweekly':
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
  }

  // Create next appointment
  const nextAppointment = new (appointment.constructor as any)({
    appointmentId: `${appointment.appointmentId}_${currentOccurrence + 1}`,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    type: appointment.type,
    scheduledDateTime: nextDate,
    duration: appointment.duration,
    timeZone: appointment.timeZone,
    recurringAppointment: {
      ...appointment.recurringAppointment,
      currentOccurrence: currentOccurrence + 1,
      parentAppointmentId: appointment.recurringAppointment.parentAppointmentId || appointment.appointmentId
    }
  });

  await nextAppointment.save();
}

// Virtual fields
appointmentSchema.virtual('endDateTime').get(function() {
  return new Date(this.scheduledDateTime.getTime() + this.duration * 60000);
});

appointmentSchema.virtual('isUpcomingVirtual').get(function() {
  return this.isUpcoming();
});

appointmentSchema.virtual('timeUntilAppointment').get(function() {
  return this.getTimeUntilAppointment();
});

appointmentSchema.virtual('patientInfo', {
  ref: 'User',
  localField: 'patientId',
  foreignField: '_id',
  justOne: true
});

appointmentSchema.virtual('doctorInfo', {
  ref: 'User',
  localField: 'doctorId',
  foreignField: '_id',
  justOne: true
});

appointmentSchema.virtual('consultationInfo', {
  ref: 'Consultation',
  localField: 'consultationId',
  foreignField: '_id',
  justOne: true
});

// Create and export the model
const Appointment: Model<IAppointment> = mongoose.model<IAppointment>('Appointment', appointmentSchema);

export default Appointment;