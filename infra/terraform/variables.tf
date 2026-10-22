variable "aws_region" {
  type        = string
  description = "Región validada por costo, latencia y tratamiento de datos"
  default     = "sa-east-1"
}

variable "environment" {
  type        = string
  description = "dev, test o prod"
  validation {
    condition     = contains(["dev", "test", "prod"], var.environment)
    error_message = "environment debe ser dev, test o prod."
  }
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "database_ingress_security_group_ids" {
  type        = list(string)
  description = "Security groups de las tareas ECS autorizadas"
}
