resource "aws_lambda_function" "pull_faces" {
  filename         = "${path.module}/lambda_pull_faces.zip"
  function_name    = "pullFaces"
  role             = aws_iam_role.lambda_exec_role.arn
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  source_code_hash = filebase64sha256("${path.module}/lambda_pull_faces.zip")

  environment {
    variables = {
      MONGODB_URI = var.mongodb_uri
      MONGODB_DB  = var.mongodb_db
    }
  }

  timeout     = 15
  memory_size = 256
}

resource "aws_lambda_permission" "allow_pull_faces_api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pull_faces.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.photos_api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_integration" "lambda_pull_faces_integration" {
  api_id                 = aws_apigatewayv2_api.photos_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.pull_faces.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "pull_faces_route" {
  api_id    = aws_apigatewayv2_api.photos_api.id
  route_key = "GET /api/photos"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_pull_faces_integration.id}"
}
