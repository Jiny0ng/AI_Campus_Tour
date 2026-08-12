import { HomeScreen } from "@/components/Home";
import { homeServiceOptions } from "@/dummy";

export default function HomePage() {
  return <HomeScreen serviceOptions={homeServiceOptions} />;
}
