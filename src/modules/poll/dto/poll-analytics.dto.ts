export interface OptionBreakdownDto {
  option_id: string;
  option_text: string;
  count: number;
  percentage: number;
}

export interface UserResponseDto {
  user_id: string;
  employee_name: string;  // ADDED
  selected_options: string[];
  response_text?: string;
  response_rating?: number;
  submitted_at: Date;
}

export interface QuestionAnalyticsDto {
  question_id: string;
  question_text: string;
  question_type: string;
  total_responses: number;
  options_breakdown: OptionBreakdownDto[];
  user_responses: UserResponseDto[];
}

export interface PollAnalyticsDto {
  poll: any; // Will be Poll entity
  total_responses: number;
  response_rate: number;
  questions_analytics: QuestionAnalyticsDto[];
}

export interface PollWithAnalyticsDto {
  poll: any; // Will be Poll entity
  analytics: PollAnalyticsDto;
}

export interface PollSummaryDto {
  id: string;
  title: string;
  description?: string;
  start_time?: Date;
  end_time?: Date;
  is_anonymous: boolean;
  created_by: string;
  created_by_name: string;  // ADDED
  created_at: Date;
  updated_at: Date;
  total_responses: number;
  is_active: boolean | undefined;
  questions: number;  // ADDED
}
