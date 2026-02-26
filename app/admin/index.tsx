import React from "react";
import { Redirect } from "expo-router";

const APP_MODE = process.env.EXPO_PUBLIC_APP_MODE;

export default function AdminRootRedirectScreen() {
  // 🔒 In public mode → admin niet bereikbaar
  if (APP_MODE === "public") {
    return <Redirect href="/" />;
  }

  return <Redirect href="/(admin)" />;
}