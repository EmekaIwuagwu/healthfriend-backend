import { Document } from 'mongoose';

export interface IUser extends Document {
  _id: string;
  walletAddress: string;
  signature?: string;
  nonce?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  role: 'patient' | 'doctor' | 'admin';
  avatar?: string;
  address?: IAddress;
  medicalHistory?: IMedicalHistory[];
  allergies?: string[];
  currentMedications?: string[];
  emergencyContact?: IEmergencyContact;
  doctorProfile?: IDoctorProfile;
  isActive: boolean;
  lastLogin?: Date;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface IMedicalHistory {
  condition: string;
  diagnosedDate: Date;
  notes?: string;
  _id?: string;
}

export interface IEmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface IDoctorProfile {
  specialization: string[];
  licenseNumber: string;
  yearsExperience: number;
  education: string[];
  certifications: string[];
  languages: string[];
  consultationFee: number;
  homeVisitFee: number;
  isVerified: boolean;
  verificationDate?: Date;
  bio?: string;
  rating: number;
  totalReviews: number;
  isAvailable: boolean;
  availability: IAvailability[];
  documentsUploaded: string[];
}

export interface IAvailability {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  startTime: string; // Format: "HH:MM" (24-hour)
  endTime: string;   // Format: "HH:MM" (24-hour)
  _id?: string;
}

// Request/Response interfaces
export interface IUserRegistration {
  walletAddress: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'patient' | 'doctor';
  phone?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
}

export interface IUserLogin {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface IUserUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female' | 'other';
  address?: IAddress;
  allergies?: string[];
  currentMedications?: string[];
  emergencyContact?: IEmergencyContact;
}

export interface IDoctorProfileUpdate {
  specialization?: string[];
  licenseNumber?: string;
  yearsExperience?: number;
  education?: string[];
  certifications?: string[];
  languages?: string[];
  consultationFee?: number;
  homeVisitFee?: number;
  bio?: string;
  availability?: IAvailability[];
}

export interface IWalletAuthMessage {
  walletAddress: string;
  nonce: string;
  timestamp: number;
}

export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
  user: Partial<IUser>;
}

export interface IUserStats {
  totalConsultations: number;
  completedConsultations: number;
  upcomingAppointments: number;
  totalSpent?: number;
  totalEarned?: number;
}