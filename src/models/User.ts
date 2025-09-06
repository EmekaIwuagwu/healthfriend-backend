import mongoose, { Schema, Model } from 'mongoose';
import { IUser, IAddress, IMedicalHistory, IEmergencyContact, IDoctorProfile, IAvailability } from '../types/User';

// Address Schema
const addressSchema = new Schema<IAddress>({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  country: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  coordinates: {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  }
}, { _id: false });

// Medical History Schema
const medicalHistorySchema = new Schema<IMedicalHistory>({
  condition: { type: String, required: true, trim: true },
  diagnosedDate: { type: Date, required: true },
  notes: { type: String, trim: true }
}, { timestamps: true });

// Emergency Contact Schema
const emergencyContactSchema = new Schema<IEmergencyContact>({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  relationship: { type: String, required: true, trim: true }
}, { _id: false });

// Availability Schema
const availabilitySchema = new Schema<IAvailability>({
  day: {
    type: String,
    required: true,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  },
  startTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'Start time must be in HH:MM format'
    }
  },
  endTime: {
    type: String,
    required: true,
    validate: {
      validator: function(v: string) {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: 'End time must be in HH:MM format'
    }
  }
});

// Doctor Profile Schema
const doctorProfileSchema = new Schema<IDoctorProfile>({
  specialization: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one specialization is required'
    }
  },
  licenseNumber: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    sparse: true
  },
  yearsExperience: {
    type: Number,
    required: true,
    min: 0,
    max: 60
  },
  education: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one education entry is required'
    }
  },
  certifications: [String],
  languages: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one language is required'
    }
  },
  consultationFee: {
    type: Number,
    required: true,
    min: 0
  },
  homeVisitFee: {
    type: Number,
    required: true,
    min: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationDate: Date,
  bio: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0,
    min: 0
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  availability: [availabilitySchema],
  documentsUploaded: [String]
}, { _id: false });

// Main User Schema
const userSchema = new Schema<IUser>({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid wallet address format'
    }
  },
  signature: {
    type: String,
    select: false // Don't include in queries by default
  },
  nonce: {
    type: String,
    select: false // Don't include in queries by default
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Invalid email format'
    }
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v: string) {
        return !v || /^\+?[\d\s\-\(\)]{10,15}$/.test(v);
      },
      message: 'Invalid phone number format'
    }
  },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(v: Date) {
        return !v || v <= new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other']
  },
  role: {
    type: String,
    required: true,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient'
  },
  avatar: {
    type: String,
    trim: true
  },
  address: addressSchema,
  medicalHistory: [medicalHistorySchema],
  allergies: {
    type: [String],
    validate: {
      validator: function(v: string[]) {
        return !v || v.length <= 50;
      },
      message: 'Cannot have more than 50 allergies'
    }
  },
  currentMedications: {
    type: [String],
    validate: {
      validator: function(v: string[]) {
        return !v || v.length <= 50;
      },
      message: 'Cannot have more than 50 current medications'
    }
  },
  emergencyContact: emergencyContactSchema,
  doctorProfile: {
    type: doctorProfileSchema,
    required: function(this: IUser) {
      return this.role === 'doctor';
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  emailVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive fields from JSON output
      delete ret.signature;
      delete ret.nonce;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    transform: function(doc, ret) {
      // Remove sensitive fields from object output
      delete ret.signature;
      delete ret.nonce;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better query performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ 'doctorProfile.isVerified': 1 });
userSchema.index({ 'doctorProfile.specialization': 1 });
userSchema.index({ 'doctorProfile.isAvailable': 1 });
userSchema.index({ createdAt: -1 });

// Compound indexes
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ role: 1, 'doctorProfile.isVerified': 1, 'doctorProfile.isAvailable': 1 });

// Pre-save middleware
userSchema.pre('save', async function(next) {
  // Ensure doctor profile exists for doctors
  if (this.role === 'doctor' && !this.doctorProfile) {
    this.doctorProfile = {
      specialization: [],
      licenseNumber: '',
      yearsExperience: 0,
      education: [],
      certifications: [],
      languages: [],
      consultationFee: 0,
      homeVisitFee: 0,
      isVerified: false,
      rating: 0,
      totalReviews: 0,
      isAvailable: true,
      availability: [],
      documentsUploaded: []
    } as IDoctorProfile;
  }

  // Remove doctor profile for non-doctors
  if (this.role !== 'doctor') {
    this.doctorProfile = undefined;
  }

  next();
});

// Instance methods
userSchema.methods.getFullName = function(): string {
  return `${this.firstName} ${this.lastName}`;
};

userSchema.methods.isDoctor = function(): boolean {
  return this.role === 'doctor';
};

userSchema.methods.isPatient = function(): boolean {
  return this.role === 'patient';
};

userSchema.methods.isAdmin = function(): boolean {
  return this.role === 'admin';
};

userSchema.methods.isDoctorVerified = function(): boolean {
  return this.role === 'doctor' && this.doctorProfile?.isVerified === true;
};

userSchema.methods.updateLastLogin = function(): Promise<IUser> {
  this.lastLogin = new Date();
  return this.save();
};

userSchema.methods.addMedicalHistory = function(condition: string, diagnosedDate: Date, notes?: string): Promise<IUser> {
  this.medicalHistory = this.medicalHistory || [];
  this.medicalHistory.push({ condition, diagnosedDate, notes });
  return this.save();
};

userSchema.methods.updateDoctorRating = function(newRating: number): Promise<IUser> {
  if (this.role !== 'doctor' || !this.doctorProfile) {
    throw new Error('User is not a doctor');
  }

  const currentRating = this.doctorProfile.rating || 0;
  const currentReviews = this.doctorProfile.totalReviews || 0;
  
  const totalPoints = currentRating * currentReviews + newRating;
  const newTotalReviews = currentReviews + 1;
  
  this.doctorProfile.rating = totalPoints / newTotalReviews;
  this.doctorProfile.totalReviews = newTotalReviews;
  
  return this.save();
};

// Static methods
userSchema.statics.findByWalletAddress = function(walletAddress: string): Promise<IUser | null> {
  return this.findOne({ walletAddress: walletAddress.toLowerCase() });
};

userSchema.statics.findByEmail = function(email: string): Promise<IUser | null> {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findDoctors = function(filters: any = {}) {
  const query = { role: 'doctor', isActive: true, ...filters };
  return this.find(query);
};

userSchema.statics.findVerifiedDoctors = function(filters: any = {}) {
  const query = { 
    role: 'doctor', 
    isActive: true, 
    'doctorProfile.isVerified': true,
    ...filters 
  };
  return this.find(query);
};

userSchema.statics.findAvailableDoctors = function(specialization?: string) {
  const query: any = {
    role: 'doctor',
    isActive: true,
    'doctorProfile.isVerified': true,
    'doctorProfile.isAvailable': true
  };

  if (specialization) {
    query['doctorProfile.specialization'] = { $in: [specialization] };
  }

  return this.find(query);
};

userSchema.statics.searchDoctors = function(searchQuery: string, filters: any = {}) {
  const searchRegex = new RegExp(searchQuery, 'i');
  
  const query = {
    role: 'doctor',
    isActive: true,
    'doctorProfile.isVerified': true,
    $or: [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { 'doctorProfile.specialization': { $in: [searchRegex] } },
      { 'doctorProfile.bio': searchRegex }
    ],
    ...filters
  };

  return this.find(query);
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Ensure virtual fields are included in JSON
userSchema.set('toJSON', { virtuals: true });

// Create and export the model
const User: Model<IUser> = mongoose.model<IUser>('User', userSchema);

export default User;