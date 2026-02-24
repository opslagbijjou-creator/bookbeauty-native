import React from "react";
import { Redirect } from "expo-router";

export default function AdminRootRedirectScreen() {
  return <Redirect href="/(admin)" />;
}
