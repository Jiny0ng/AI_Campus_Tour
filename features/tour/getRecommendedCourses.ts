import type { TourAudience, TourCourse } from "@/types";

export function getRecommendedCourses(courses: TourCourse[], audience: TourAudience) {
  return courses.filter((course) => course.audience === audience);
}
