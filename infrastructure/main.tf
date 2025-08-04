resource "aws_lambda_function" "upload_photo" {
  filename         = "${path.module}/lambda_upload.zip"
  function_name    = "uploadPhoto"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  source_code_hash = filebase64sha256("${path.module}/lambda_upload.zip")

  environment {
    variables = {
      CLOUDINARY_CLOUD_NAME = var.cloudinary_cloud_name
      CLOUDINARY_API_KEY    = var.cloudinary_api_key
      CLOUDINARY_API_SECRET = var.cloudinary_api_secret
      MONGODB_DB            = var.mongodb_db
      MONGODB_URI           = var.mongodb_uri
    }
  }

  timeout     = 15
  memory_size = 256
}

resource "aws_apigatewayv2_api" "upload_api" {
  name          = "upload-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    # allow_origins = ["https://mfaces-78d7a.web.app"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type"]
    max_age       = 3600
  }
}

resource "aws_lambda_permission" "allow_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_photo.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.upload_api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.upload_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.upload_photo.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "upload_route" {
  api_id    = aws_apigatewayv2_api.upload_api.id
  route_key = "POST /api/upload"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.upload_api.id
  name        = "$default"
  auto_deploy = true
}

output "upload_api_url" {
  value = aws_apigatewayv2_api.upload_api.api_endpoint
}
