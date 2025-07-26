export interface RegisterUserBody {
  fullName: string;
  email: string;
  password: string;
  collegeId: string;
  forumId?: string; 
  role: "student" | "teacher" | "forum_head"; 
}

export interface VerifyEmailBody {
  email: string;
  otp: string;
}

export interface LoginUserBody {
  email: string;
  password: string;
}


export interface CreateCollegeBody {
  name: string;
  domainName: string;
}

export interface CreateCollegeAdminBody {
  fullName: string;
  email: string;
  password: string;
}