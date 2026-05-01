import React from "react";
import PastTripsPage from "./components/PastTripsPage";

export const metadata = {
  title: "Past trips | TripStory",
  description: "Generate lifecycle recap presentations from previous trips.",
};

const page = () => {
  return <PastTripsPage />;
};

export default page;
