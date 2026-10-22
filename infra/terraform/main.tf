locals {
  name       = "comercial-${var.environment}"
  queue_names = toset(["prospecting", "inbox", "crm", "imports"])
}

resource "aws_kms_key" "platform" {
  description             = "Cifrado de secretos y datos de ${local.name}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_s3_bucket" "files" {
  bucket_prefix = "${local.name}-files-"
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.platform.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    id     = "delete-temporary-imports"
    status = "Enabled"
    filter { prefix = "temporary/" }
    expiration { days = 30 }
  }
}

resource "aws_sqs_queue" "dlq" {
  for_each                  = local.queue_names
  name                      = "${local.name}-${each.key}-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.platform.arn
}

resource "aws_sqs_queue" "jobs" {
  for_each                   = local.queue_names
  name                       = "${local.name}-${each.key}"
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  kms_master_key_id          = aws_kms_key.platform.arn
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 5
  })
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "database" {
  name_prefix = "${local.name}-db-"
  vpc_id      = var.vpc_id

  dynamic "ingress" {
    for_each = toset(var.database_ingress_security_group_ids)
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "random_password" "database" {
  length  = 32
  special = true
}

resource "aws_db_instance" "postgres" {
  identifier                     = local.name
  engine                         = "postgres"
  engine_version                 = "16"
  instance_class                 = var.environment == "prod" ? "db.t4g.small" : "db.t4g.micro"
  allocated_storage              = 20
  max_allocated_storage          = 100
  storage_encrypted              = true
  kms_key_id                     = aws_kms_key.platform.arn
  db_name                        = "comercial"
  username                       = "platform_admin"
  password                       = random_password.database.result
  db_subnet_group_name           = aws_db_subnet_group.main.name
  vpc_security_group_ids         = [aws_security_group.database.id]
  publicly_accessible            = false
  multi_az                       = var.environment == "prod"
  backup_retention_period        = var.environment == "prod" ? 14 : 3
  deletion_protection            = var.environment == "prod"
  skip_final_snapshot            = var.environment != "prod"
  performance_insights_enabled   = true
  auto_minor_version_upgrade     = true
  apply_immediately              = false
}

resource "aws_secretsmanager_secret" "database" {
  name       = "${local.name}/database"
  kms_key_id = aws_kms_key.platform.arn
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    host     = aws_db_instance.postgres.address
    port     = aws_db_instance.postgres.port
    dbname   = aws_db_instance.postgres.db_name
    username = aws_db_instance.postgres.username
    password = random_password.database.result
  })
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.name}-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.platform.arn
  }
}

resource "aws_ecr_repository" "web" {
  name                 = "${local.name}-web"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_repository" "worker" {
  name                 = "${local.name}-worker"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "application" {
  name              = "/ecs/${local.name}"
  retention_in_days = var.environment == "prod" ? 90 : 14
  kms_key_id        = aws_kms_key.platform.arn
}
