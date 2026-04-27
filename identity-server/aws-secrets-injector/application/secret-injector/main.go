// -------------------------------------------------------------------------------------
//
// Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com).
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.
//
// --------------------------------------------------------------------------------------

package main

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Fetch configuration from environment variables
	secretName := os.Getenv("SECRET_NAME")
	awsRegion := os.Getenv("AWS_REGION")
	outputFilePath := os.Getenv("OUTPUT_PATH")

	// Validate that all required environment variables are set and exit if not
	if secretName == "" || awsRegion == "" || outputFilePath == "" {
		log.Fatal("Error: Required environment variables (SECRET_NAME, AWS_REGION, OUTPUT_PATH) are not set.")
	}
	log.Printf("Starting secret retrieval for '%s' in region '%s'", secretName, awsRegion)

	// Create a new AWS session
	sess, err := session.NewSession()
	if err != nil {
		log.Fatalf("Failed to create new AWS session: %v", err)
	}

	svc := secretsmanager.New(sess, &aws.Config{
		Region: aws.String(awsRegion),
	})

	input := &secretsmanager.GetSecretValueInput{
		SecretId:     aws.String(secretName),
		VersionStage: aws.String("AWSCURRENT"),
	}

	// Retrieve the secret value
	result, err := svc.GetSecretValue(input)
	if err != nil {
		if aerr, ok := err.(awserr.Error); ok {
			log.Fatalf("AWS Error retrieving secret. Code: %s, Message: %s", aerr.Code(), aerr.Error())
		} else {
			log.Fatalf("Unknown error retrieving secret: %v", err.Error())
		}
	}

	// Handle both string and binary secrets
	var secretValue string
	if result.SecretString != nil {
		secretValue = *result.SecretString
		log.Println("Secret successfully retrieved as a string.")
	} else {
		decodedBinarySecretBytes := make([]byte, base64.StdEncoding.DecodedLen(len(result.SecretBinary)))
		len, err := base64.StdEncoding.Decode(decodedBinarySecretBytes, result.SecretBinary)
		if err != nil {
			log.Fatalf("Failed to decode binary secret from base64: %v", err)
		}
		secretValue = string(decodedBinarySecretBytes[:len])
		log.Println("Secret successfully retrieved as binary and decoded.")
	}

	// Write the secret to the configured output file
	err = os.WriteFile(outputFilePath, []byte(secretValue), 0644)
	if err != nil {
		log.Fatalf("Failed to write secret to file '%s': %v", outputFilePath, err)
	}

	log.Printf("Secret written successfully to %s", outputFilePath)
	fmt.Println("Process completed successfully.")
}

