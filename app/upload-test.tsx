import React, { useState } from "react";
import { View, Button, Image, Text } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadToCloudinary } from "../lib/uploadToCloudinary";

export default function UploadTest() {
  const [url, setUrl] = useState<string | null>(null);

  async function pickAndUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) return;

    const uri = result.assets[0].uri;

    const uploadedUrl = await uploadToCloudinary(uri);

    setUrl(uploadedUrl);
  }

  return (
    <View style={{ padding: 30, marginTop: 50 }}>
      <Button title="Upload Image" onPress={pickAndUpload} />

      {url && (
        <>
          <Text style={{ marginTop: 20 }}>Uploaded:</Text>
          <Image
            source={{ uri: url }}
            style={{ width: 200, height: 200, marginTop: 10 }}
          />
        </>
      )}
    </View>
  );
}